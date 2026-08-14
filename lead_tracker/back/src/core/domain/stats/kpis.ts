import type { Distributeur } from 'shared/types/distributeur';
import type { LeadRecord } from 'shared/types/lead';
import type { StatsKpis } from 'shared/types/stats';
import { classifyLead } from './leadClassification';
import { roundToOneDecimal } from './shared';

export function computeKpis(leads: LeadRecord[], distributeurs: Distributeur[], daysToCloseByLead: Map<string, number>, now: Date): StatsKpis {
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
  const avgDaysToClose =
    closedDurations.length > 0 ? roundToOneDecimal(closedDurations.reduce((sum, days) => sum + days, 0) / closedDurations.length) : null;

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
