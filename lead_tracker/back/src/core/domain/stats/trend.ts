import type { LeadRecord } from 'shared/types/lead';
import type { StatsTrend } from 'shared/types/stats';
import { parseSalesforceDate } from './shared';

function isoWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7; // lundi = 1 ... dimanche = 7
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 1);
  return d.toISOString().slice(0, 10);
}

export function computeTrend(leads: LeadRecord[]): StatsTrend {
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
