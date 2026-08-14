import type { Distributeur } from 'shared/types/distributeur';
import type { HistoriqueEntry, LeadRecord } from 'shared/types/lead';
import type { StatsResponse } from 'shared/types/stats';
import {
  computeProductConversionByDistributeur,
  computeProductsByDistributeur,
  computeSourceByDistributeur,
  computeStatusByDistributeur,
  countBy,
} from './breakdowns';
import { computeDistributeurStats } from './distributeurStats';
import { computeDaysToClose, computeDaysToFirstUpdate } from './durations';
import { computeKpis } from './kpis';
import { computeRegionByDistributeur, REGIONS } from './region';
import { computeStageVelocity } from './stageVelocity';
import { computeTrend } from './trend';

// Les agrégats "ByRegion" réutilisent tels quels les mêmes calculs "ByDistributeur" (statut,
// source, produits, stage velocity, DistributeurStat) en leur passant des leads dont le champ
// `distributeur` a été remplacé par sa zone — aucun de ces calculs ne dépend de rien d'autre que
// `lead.distributeur`, donc pas besoin de les dupliquer pour raisonner "par zone" plutôt que "par
// distributeur".
function regroupLeadsByRegion(leads: LeadRecord[], regionByDistributeur: Record<string, string>): LeadRecord[] {
  return leads.map((lead) => ({
    ...lead,
    distributeur: lead.distributeur ? (regionByDistributeur[lead.distributeur] ?? 'Unspecified') : '',
  }));
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

  const regionByDistributeur = computeRegionByDistributeur(distributeurs);
  const regionLeads = regroupLeadsByRegion(leads, regionByDistributeur);
  const regionEntities: Distributeur[] = REGIONS.map((region) => ({ nom: region, mail: '', zone: '' }));

  return {
    kpis: computeKpis(leads, distributeurs, daysToCloseByLead, now),
    statusBreakdown: countBy(leads.map((lead) => lead.valeurs['Lead Status'])),
    sourceBreakdown,
    productBreakdown: countBy(leads.map((lead) => lead.valeurs['Product Interest'])),
    distributeurs: computeDistributeurStats(leads, distributeurs, daysToCloseByLead, daysToFirstUpdateByLead, now),
    trend: computeTrend(leads),
    productsByDistributeur: computeProductsByDistributeur(leads),
    productConversionByDistributeur: computeProductConversionByDistributeur(leads),
    statusByDistributeur: computeStatusByDistributeur(leads),
    sourceByDistributeur: computeSourceByDistributeur(leads, sourceBreakdown),
    stageVelocity: computeStageVelocity(leads, distributeurs, historique),
    regionByDistributeur,
    regions: computeDistributeurStats(regionLeads, regionEntities, daysToCloseByLead, daysToFirstUpdateByLead, now),
    productsByRegion: computeProductsByDistributeur(regionLeads),
    productConversionByRegion: computeProductConversionByDistributeur(regionLeads),
    statusByRegion: computeStatusByDistributeur(regionLeads),
    sourceByRegion: computeSourceByDistributeur(regionLeads, sourceBreakdown),
    stageVelocityByRegion: computeStageVelocity(regionLeads, regionEntities, historique),
  };
}
