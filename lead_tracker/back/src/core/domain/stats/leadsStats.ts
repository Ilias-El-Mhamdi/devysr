import type { Distributeur } from 'shared/types/distributeur';
import type { HistoriqueEntry, LeadRecord } from 'shared/types/lead';
import type {
  DistributeurStageVelocity,
  DistributeurStat,
  ProductsByDistributeur,
  SourceByDistributeur,
  StageVelocity,
  StatsCount,
  StatsKpis,
  StatsResponse,
  StatsTrend,
  StatusByDistributeur,
} from 'shared/types/stats';

const STATUS_ORDER = ['Open - Not Contacted', 'Working - Contacted', 'Closed - Converted', 'Closed - Not Converted'];

// Les seules transitions qui ont un sens métier : on ignore par ex. Closed→Open ou
// Closed - Converted→Closed - Not Converted, qui n'arrivent normalement jamais dans le pipeline.
const STAGE_TRANSITIONS: Array<{ from: string; to: string }> = [
  { from: 'Open - Not Contacted', to: 'Working - Contacted' },
  { from: 'Open - Not Contacted', to: 'Closed - Converted' },
  { from: 'Open - Not Contacted', to: 'Closed - Not Converted' },
  { from: 'Working - Contacted', to: 'Closed - Converted' },
  { from: 'Working - Contacted', to: 'Closed - Not Converted' },
];

const EMPTY_VALUE = '-';
const STALE_AFTER_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Arrondi à 0.1 près : au-delà, deux distributeurs "mis à jour il y a 7.38j" et "7.41j" s'affichent
// identiques (7.4j) mais ne sont jamais considérés égaux par un tri — l'arrondi à la source évite
// cet ordre incohérent avec ce qui est affiché.
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return roundToOneDecimal(sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

function isWon(status: string | undefined): boolean {
  return status === 'Closed - Converted';
}

function isLost(status: string | undefined): boolean {
  if (!status || isWon(status)) return false;
  return status.startsWith('Closed');
}

// Format Salesforce "Create Date"/"Last Modified" : JJ/MM/AAAA. `null` si vide ou illisible.
function parseSalesforceDate(value: string | undefined): Date | null {
  if (!value || value === EMPTY_VALUE) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function isoWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7; // lundi = 1 ... dimanche = 7
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 1);
  return d.toISOString().slice(0, 10);
}

function countBy(values: string[]): StatsCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value && value !== EMPTY_VALUE ? value : 'Unspecified';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

interface LeadClassification {
  isWon: boolean;
  isLost: boolean;
  isWorking: boolean;
  isOpen: boolean;
  isNew7: boolean;
  isNew30: boolean;
  isStale: boolean;
}

// Un seul endroit qui décide "ouvert/en cours/gagné/perdu/récent/en sommeil" pour un lead — repris
// tel quel par le KPI global et par l'agrégat par distributeur, pour ne jamais désynchroniser les
// deux (cf. § Pièges spécifiques du CLAUDE.md : pas deux calculs de la même règle).
function classifyLead(lead: LeadRecord, now: Date): LeadClassification {
  const status = lead.valeurs['Lead Status'];
  const won = isWon(status);
  const lost = isLost(status);
  const working = !won && !lost && status === 'Working - Contacted';
  const open = !won && !lost && !working;

  const createDate = parseSalesforceDate(lead.valeurs['Create Date']);
  const ageDays = createDate ? (now.getTime() - createDate.getTime()) / MS_PER_DAY : null;

  const lastModified = parseSalesforceDate(lead.valeurs['Last Modified']);
  const isStale = !won && !lost && lastModified !== null && (now.getTime() - lastModified.getTime()) / MS_PER_DAY > STALE_AFTER_DAYS;

  return {
    isWon: won,
    isLost: lost,
    isWorking: working,
    isOpen: open,
    isNew7: ageDays !== null && ageDays <= 7,
    isNew30: ageDays !== null && ageDays <= 30,
    isStale,
  };
}

function computeKpis(leads: LeadRecord[], distributeurs: Distributeur[], daysToCloseByLead: Map<string, number>, now: Date): StatsKpis {
  let won = 0;
  let lost = 0;
  let open = 0;
  let working = 0;
  let createdLast7Days = 0;
  let createdLast30Days = 0;
  let staleLeads = 0;

  for (const lead of leads) {
    const c = classifyLead(lead, now);
    if (c.isWon) won += 1;
    else if (c.isLost) lost += 1;
    else if (c.isWorking) working += 1;
    else open += 1;
    if (c.isNew7) createdLast7Days += 1;
    if (c.isNew30) createdLast30Days += 1;
    if (c.isStale) staleLeads += 1;
  }

  const closedDurations = [...daysToCloseByLead.values()];
  const avgDaysToClose = closedDurations.length > 0 ? closedDurations.reduce((sum, days) => sum + days, 0) / closedDurations.length : null;

  return {
    totalLeads: leads.length,
    totalDistributeurs: distributeurs.length,
    open,
    working,
    won,
    lost,
    winRate: won + lost > 0 ? won / (won + lost) : null,
    createdLast7Days,
    createdLast30Days,
    staleLeads,
    avgDaysToClose,
  };
}

// Pour chaque lead clôturé (gagné ou perdu), durée en jours entre son import dans l'outil et le
// premier changement de "Lead Status" vers un statut clôturé — proxy de "temps de traitement côté
// équipe commerciale" (pas la date de création Salesforce, non fiable pour un import en masse où
// tous les leads historiques partagent la même dateImport).
function computeDaysToClose(leads: LeadRecord[], historique: HistoriqueEntry[]): Map<string, number> {
  const dateImportByLead = new Map(leads.map((lead) => [lead.id, new Date(lead.dateImport)]));
  const firstCloseDateByLead = new Map<string, Date>();

  for (const entry of historique) {
    if (entry.champ !== 'Lead Status') continue;
    if (!isWon(entry.apres) && !isLost(entry.apres)) continue;
    const closeDate = new Date(entry.date);
    const existing = firstCloseDateByLead.get(entry.leadId);
    if (!existing || closeDate < existing) {
      firstCloseDateByLead.set(entry.leadId, closeDate);
    }
  }

  const daysToClose = new Map<string, number>();
  for (const [leadId, closeDate] of firstCloseDateByLead) {
    const importDate = dateImportByLead.get(leadId);
    if (!importDate) continue;
    const days = (closeDate.getTime() - importDate.getTime()) / MS_PER_DAY;
    daysToClose.set(leadId, Math.max(days, 0));
  }
  return daysToClose;
}

// Pour chaque lead ayant au moins une entrée d'historique (n'importe quel champ), durée en jours
// entre son import et sa toute première modification — proxy de "combien de temps avant qu'un
// distributeur touche un lead qu'on vient de lui assigner".
function computeDaysToFirstUpdate(leads: LeadRecord[], historique: HistoriqueEntry[]): Map<string, number> {
  const dateImportByLead = new Map(leads.map((lead) => [lead.id, new Date(lead.dateImport)]));
  const firstUpdateDateByLead = new Map<string, Date>();

  for (const entry of historique) {
    const entryDate = new Date(entry.date);
    const existing = firstUpdateDateByLead.get(entry.leadId);
    if (!existing || entryDate < existing) {
      firstUpdateDateByLead.set(entry.leadId, entryDate);
    }
  }

  const daysToFirstUpdate = new Map<string, number>();
  for (const [leadId, updateDate] of firstUpdateDateByLead) {
    const importDate = dateImportByLead.get(leadId);
    if (!importDate) continue;
    const days = (updateDate.getTime() - importDate.getTime()) / MS_PER_DAY;
    daysToFirstUpdate.set(leadId, Math.max(days, 0));
  }
  return daysToFirstUpdate;
}

// Statut du lead avant sa toute première ligne d'historique sur "Lead Status" — c'est ce statut,
// pas forcément "Open - Not Contacted", qui correspond à sa date d'import (cf. `computeStageVelocity`).
function computeInitialStatusByLead(leads: LeadRecord[], historique: HistoriqueEntry[]): Map<string, string> {
  const earliestChangeByLead = new Map<string, HistoriqueEntry>();
  for (const entry of historique) {
    if (entry.champ !== 'Lead Status') continue;
    const existing = earliestChangeByLead.get(entry.leadId);
    if (!existing || new Date(entry.date) < new Date(existing.date)) {
      earliestChangeByLead.set(entry.leadId, entry);
    }
  }

  const initialStatusByLead = new Map<string, string>();
  for (const lead of leads) {
    const earliestChange = earliestChangeByLead.get(lead.id);
    initialStatusByLead.set(lead.id, earliestChange?.avant ?? lead.valeurs['Lead Status'] ?? '');
  }
  return initialStatusByLead;
}

// Pour chaque lead, la première date à laquelle il a atteint chaque statut vu dans son historique
// — le statut initial est daté par `dateImport` (on n'a pas de log d'entrée dedans, seulement de
// sortie), les suivants par la première ligne d'historique où `apres` vaut ce statut.
function computeFirstEntryDatesByLead(
  leads: LeadRecord[],
  historique: HistoriqueEntry[],
  initialStatusByLead: Map<string, string>,
): Map<string, Map<string, Date>> {
  const firstEntryDatesByLead = new Map<string, Map<string, Date>>();
  for (const lead of leads) {
    const dates = new Map<string, Date>();
    const initialStatus = initialStatusByLead.get(lead.id);
    if (initialStatus) dates.set(initialStatus, new Date(lead.dateImport));
    firstEntryDatesByLead.set(lead.id, dates);
  }

  for (const entry of historique) {
    if (entry.champ !== 'Lead Status') continue;
    const dates = firstEntryDatesByLead.get(entry.leadId);
    if (!dates) continue;
    const entryDate = new Date(entry.date);
    const existing = dates.get(entry.apres);
    if (!existing || entryDate < existing) {
      dates.set(entry.apres, entryDate);
    }
  }
  return firstEntryDatesByLead;
}

// `null` si le lead n'est jamais passé par les deux statuts, ou s'il les a atteints dans l'ordre
// inverse (ex. repassé de "Closed" à "Working" par erreur) — pas une vraie transition observée.
function computeTransitionDurationDays(fromDate: Date | undefined, toDate: Date | undefined): number | null {
  if (!fromDate || !toDate) return null;
  const days = (toDate.getTime() - fromDate.getTime()) / MS_PER_DAY;
  return days >= 0 ? days : null;
}

function computeStageVelocity(leads: LeadRecord[], distributeurs: Distributeur[], historique: HistoriqueEntry[]): StageVelocity {
  const initialStatusByLead = computeInitialStatusByLead(leads, historique);
  const firstEntryDatesByLead = computeFirstEntryDatesByLead(leads, historique, initialStatusByLead);

  const leadsByDistributeur = new Map<string, LeadRecord[]>();
  for (const lead of leads) {
    const key = lead.distributeur || 'Unassigned';
    const list = leadsByDistributeur.get(key) ?? [];
    list.push(lead);
    leadsByDistributeur.set(key, list);
  }
  const names = new Set([...distributeurs.map((d) => d.nom), ...leadsByDistributeur.keys()]);

  const byDistributeur: DistributeurStageVelocity[] = [...names]
    .map((distributeur) => {
      const distLeads = leadsByDistributeur.get(distributeur) ?? [];
      const transitions = STAGE_TRANSITIONS.map(({ from, to }) => {
        const durations = distLeads
          .map((lead) => {
            const dates = firstEntryDatesByLead.get(lead.id);
            return computeTransitionDurationDays(dates?.get(from), dates?.get(to));
          })
          .filter((value): value is number => value !== null);

        return {
          from,
          to,
          count: durations.length,
          medianDays: median(durations),
          avgDays: durations.length > 0 ? roundToOneDecimal(durations.reduce((sum, days) => sum + days, 0) / durations.length) : null,
        };
      });
      return { distributeur, transitions };
    })
    .sort((a, b) => a.distributeur.localeCompare(b.distributeur));

  return { statuses: STATUS_ORDER, transitions: STAGE_TRANSITIONS, byDistributeur };
}

function computeDistributeurStats(
  leads: LeadRecord[],
  distributeurs: Distributeur[],
  daysToCloseByLead: Map<string, number>,
  daysToFirstUpdateByLead: Map<string, number>,
  now: Date,
): DistributeurStat[] {
  const leadsByDistributeur = new Map<string, LeadRecord[]>();
  for (const lead of leads) {
    const key = lead.distributeur || 'Unassigned';
    const list = leadsByDistributeur.get(key) ?? [];
    list.push(lead);
    leadsByDistributeur.set(key, list);
  }

  const names = new Set([...distributeurs.map((d) => d.nom), ...leadsByDistributeur.keys()]);

  return [...names]
    .map((distributeur) => {
      const distLeads = leadsByDistributeur.get(distributeur) ?? [];
      let won = 0;
      let lost = 0;
      let open = 0;
      let working = 0;
      let createdLast7Days = 0;
      let createdLast30Days = 0;
      let staleLeads = 0;
      for (const lead of distLeads) {
        const c = classifyLead(lead, now);
        if (c.isWon) won += 1;
        else if (c.isLost) lost += 1;
        else if (c.isWorking) working += 1;
        else open += 1;
        if (c.isNew7) createdLast7Days += 1;
        if (c.isNew30) createdLast30Days += 1;
        if (c.isStale) staleLeads += 1;
      }
      const durations = distLeads.map((lead) => daysToCloseByLead.get(lead.id)).filter((value): value is number => value !== undefined);
      const updateDurations = distLeads.map((lead) => daysToFirstUpdateByLead.get(lead.id)).filter((value): value is number => value !== undefined);

      let mostRecentUpdate: Date | null = null;
      for (const lead of distLeads) {
        const lastModified = parseSalesforceDate(lead.valeurs['Last Modified']);
        if (lastModified && (!mostRecentUpdate || lastModified > mostRecentUpdate)) {
          mostRecentUpdate = lastModified;
        }
      }

      return {
        distributeur,
        total: distLeads.length,
        active: open + working,
        open,
        working,
        won,
        lost,
        winRate: won + lost > 0 ? won / (won + lost) : null,
        avgDaysToClose: durations.length > 0 ? durations.reduce((sum, days) => sum + days, 0) / durations.length : null,
        daysToCloseCount: durations.length,
        createdLast7Days,
        createdLast30Days,
        staleLeads,
        lastUpdateDaysAgo: mostRecentUpdate ? roundToOneDecimal((now.getTime() - mostRecentUpdate.getTime()) / MS_PER_DAY) : null,
        avgDaysToFirstUpdate: updateDurations.length > 0 ? updateDurations.reduce((sum, days) => sum + days, 0) / updateDurations.length : null,
        daysToFirstUpdateCount: updateDurations.length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function computeTrend(leads: LeadRecord[]): StatsTrend {
  const weeksSet = new Set<string>();
  const countsByWeekAndDistributeur = new Map<string, Map<string, number>>();

  for (const lead of leads) {
    const createDate = parseSalesforceDate(lead.valeurs['Create Date']);
    if (!createDate) continue;
    const week = isoWeekStart(createDate);
    weeksSet.add(week);
    const distributeur = lead.distributeur || 'Unassigned';
    const byDistributeur = countsByWeekAndDistributeur.get(week) ?? new Map<string, number>();
    byDistributeur.set(distributeur, (byDistributeur.get(distributeur) ?? 0) + 1);
    countsByWeekAndDistributeur.set(week, byDistributeur);
  }

  const weeks = [...weeksSet].sort();
  const distributeurNames = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const total = weeks.map((week) => {
    const byDistributeur = countsByWeekAndDistributeur.get(week);
    if (!byDistributeur) return 0;
    return [...byDistributeur.values()].reduce((sum, count) => sum + count, 0);
  });

  const byDistributeur = distributeurNames.map((distributeur) => ({
    distributeur,
    counts: weeks.map((week) => countsByWeekAndDistributeur.get(week)?.get(distributeur) ?? 0),
  }));

  return { weeks, total, byDistributeur };
}

function computeProductsByDistributeur(leads: LeadRecord[]): ProductsByDistributeur {
  const products = [...new Set(leads.map((lead) => lead.valeurs['Product Interest']).filter((value) => value && value !== EMPTY_VALUE))].sort();
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = products.map(() => 0);
  }

  for (const lead of leads) {
    const product = lead.valeurs['Product Interest'];
    if (!product || product === EMPTY_VALUE) continue;
    const productIndex = products.indexOf(product);
    if (productIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    counts[distributeur][productIndex] += 1;
  }

  return { products, distributeurs, counts };
}

function computeStatusByDistributeur(leads: LeadRecord[]): StatusByDistributeur {
  const presentStatuses = new Set(leads.map((lead) => lead.valeurs['Lead Status']).filter((value) => value && value !== EMPTY_VALUE));
  const statuses = [
    ...STATUS_ORDER.filter((status) => presentStatuses.has(status)),
    ...[...presentStatuses].filter((status) => !STATUS_ORDER.includes(status)).sort(),
  ];
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = statuses.map(() => 0);
  }

  for (const lead of leads) {
    const status = lead.valeurs['Lead Status'];
    if (!status || status === EMPTY_VALUE) continue;
    const statusIndex = statuses.indexOf(status);
    if (statusIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    counts[distributeur][statusIndex] += 1;
  }

  return { statuses, distributeurs, counts };
}

// Réutilise l'ordre déjà calculé par `sourceBreakdown` (trié par volume desc) plutôt que de
// re-trier alphabétiquement — cohérence visuelle entre le graphe global et celui par distributeur.
function computeSourceByDistributeur(leads: LeadRecord[], sourceBreakdown: StatsCount[]): SourceByDistributeur {
  const sources = sourceBreakdown.map((s) => s.label);
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = sources.map(() => 0);
  }

  for (const lead of leads) {
    const raw = lead.valeurs['Lead Source'];
    const label = raw && raw !== EMPTY_VALUE ? raw : 'Unspecified';
    const sourceIndex = sources.indexOf(label);
    if (sourceIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    counts[distributeur][sourceIndex] += 1;
  }

  return { sources, distributeurs, counts };
}

export function computeStats(
  leads: LeadRecord[],
  distributeurs: Distributeur[],
  historique: HistoriqueEntry[],
  now: Date = new Date(),
): StatsResponse {
  const daysToCloseByLead = computeDaysToClose(leads, historique);
  const daysToFirstUpdateByLead = computeDaysToFirstUpdate(leads, historique);
  const sourceBreakdown = countBy(leads.map((lead) => lead.valeurs['Lead Source']));

  return {
    kpis: computeKpis(leads, distributeurs, daysToCloseByLead, now),
    statusBreakdown: countBy(leads.map((lead) => lead.valeurs['Lead Status'])),
    sourceBreakdown,
    productBreakdown: countBy(leads.map((lead) => lead.valeurs['Product Interest'])),
    distributeurs: computeDistributeurStats(leads, distributeurs, daysToCloseByLead, daysToFirstUpdateByLead, now),
    trend: computeTrend(leads),
    productsByDistributeur: computeProductsByDistributeur(leads),
    statusByDistributeur: computeStatusByDistributeur(leads),
    sourceByDistributeur: computeSourceByDistributeur(leads, sourceBreakdown),
    stageVelocity: computeStageVelocity(leads, distributeurs, historique),
  };
}
