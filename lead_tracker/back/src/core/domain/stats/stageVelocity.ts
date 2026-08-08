import type { Distributeur } from 'shared/types/distributeur';
import type { HistoriqueEntry, LeadRecord } from 'shared/types/lead';
import type { DistributeurStageVelocity, StageVelocity } from 'shared/types/stats';
import { median, MS_PER_DAY, roundToOneDecimal, STATUS_ORDER } from './shared';

// Les seules transitions qui ont un sens métier : on ignore par ex. Closed→Open ou
// Closed - Converted→Closed - Not Converted, qui n'arrivent normalement jamais dans le pipeline.
const STAGE_TRANSITIONS: Array<{ from: string; to: string }> = [
  { from: 'Open - Not Contacted', to: 'Working - Contacted' },
  { from: 'Open - Not Contacted', to: 'Closed - Converted' },
  { from: 'Open - Not Contacted', to: 'Closed - Not Converted' },
  { from: 'Working - Contacted', to: 'Closed - Converted' },
  { from: 'Working - Contacted', to: 'Closed - Not Converted' },
];

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

export function computeStageVelocity(leads: LeadRecord[], distributeurs: Distributeur[], historique: HistoriqueEntry[]): StageVelocity {
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
