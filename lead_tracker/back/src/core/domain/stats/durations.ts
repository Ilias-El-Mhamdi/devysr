import type { HistoriqueEntry, LeadRecord } from 'shared/types/lead';
import { isLost, isWon } from './leadClassification';
import { MS_PER_DAY } from './shared';

// Pour chaque lead clôturé (gagné ou perdu), durée en jours entre son import dans l'outil et le
// premier changement de "Lead Status" vers un statut clôturé — proxy de "temps de traitement côté
// équipe commerciale" (pas la date de création Salesforce, non fiable pour un import en masse où
// tous les leads historiques partagent la même dateImport).
export function computeDaysToClose(leads: LeadRecord[], historique: HistoriqueEntry[]): Map<string, number> {
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
export function computeDaysToFirstUpdate(leads: LeadRecord[], historique: HistoriqueEntry[]): Map<string, number> {
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
