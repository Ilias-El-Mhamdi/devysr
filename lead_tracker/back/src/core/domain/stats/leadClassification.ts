import type { LeadRecord } from 'shared/types/lead';
import { MS_PER_DAY, STALE_AFTER_DAYS, parseSalesforceDate } from './shared';

export function isWon(status: string | undefined): boolean {
  return status === 'Closed - Converted';
}

export function isLost(status: string | undefined): boolean {
  if (!status || isWon(status)) return false;
  return status.startsWith('Closed');
}

export interface LeadClassification {
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
export function classifyLead(lead: LeadRecord, now: Date): LeadClassification {
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
