import type { Distributeur } from 'shared/types/distributeur';
import type { LeadRecord } from 'shared/types/lead';
import type { DistributeurStat } from 'shared/types/stats';
import { classifyLead } from './leadClassification';
import { MS_PER_DAY, parseSalesforceDate, roundToOneDecimal } from './shared';

export function computeDistributeurStats(
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
