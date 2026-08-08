import type { Distributeur } from 'shared/types/distributeur';
import type { HistoriqueEntry, LeadRecord } from 'shared/types/lead';
import type { StatsResponse } from 'shared/types/stats';
import { computeProductsByDistributeur, computeSourceByDistributeur, computeStatusByDistributeur, countBy } from './breakdowns';
import { computeDistributeurStats } from './distributeurStats';
import { computeDaysToClose, computeDaysToFirstUpdate } from './durations';
import { computeKpis } from './kpis';
import { computeStageVelocity } from './stageVelocity';
import { computeTrend } from './trend';

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
