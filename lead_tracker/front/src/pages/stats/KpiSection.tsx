import { useMemo } from 'react';
import type { DistributeurStat } from 'shared/types/stats';
import { StatCard } from './StatCard';
import { formatDays, formatPercent } from './statsChartUtils';

interface KpiSectionProps {
  distributeurs: DistributeurStat[];
  activeDistributeurs: Set<string>;
}

export function KpiSection({ distributeurs, activeDistributeurs }: KpiSectionProps) {
  // Recalculé côté client à partir des agrégats par distributeur plutôt que de refaire un appel
  // réseau à chaque clic de filtre — `distributeurs` porte déjà tout ce qu'il faut par distributeur
  // (cf. DistributeurStat côté back).
  const kpis = useMemo(() => {
    const selected = distributeurs.filter((d) => activeDistributeurs.has(d.distributeur));
    const sum = (key: 'total' | 'open' | 'working' | 'won' | 'lost' | 'createdLast7Days' | 'createdLast30Days' | 'staleLeads') =>
      selected.reduce((acc, d) => acc + d[key], 0);
    const won = sum('won');
    const lost = sum('lost');
    const totalLeads = sum('total');
    const conversionRate = totalLeads > 0 ? won / totalLeads : null;
    const durationSum = selected.reduce((acc, d) => acc + (d.avgDaysToClose ?? 0) * d.daysToCloseCount, 0);
    const durationCount = selected.reduce((acc, d) => acc + d.daysToCloseCount, 0);

    // Moyenne par distributeur (pas par lead) : "en moyenne, un distributeur a touché un lead
    // il y a combien de jours" — chaque distributeur pèse pour un, indépendamment de son volume.
    const lastUpdateValues = selected.map((d) => d.lastUpdateDaysAgo).filter((value): value is number => value !== null);
    const avgDistributeurLastUpdateDays = lastUpdateValues.length > 0 ? lastUpdateValues.reduce((sum, value) => sum + value, 0) / lastUpdateValues.length : null;

    const firstUpdateSum = selected.reduce((acc, d) => acc + (d.avgDaysToFirstUpdate ?? 0) * d.daysToFirstUpdateCount, 0);
    const firstUpdateCount = selected.reduce((acc, d) => acc + d.daysToFirstUpdateCount, 0);

    return {
      totalLeads,
      totalDistributeurs: selected.length,
      open: sum('open'),
      working: sum('working'),
      won,
      lost,
      winRate: won + lost > 0 ? won / (won + lost) : null,
      conversionRate,
      createdLast7Days: sum('createdLast7Days'),
      createdLast30Days: sum('createdLast30Days'),
      staleLeads: sum('staleLeads'),
      avgDaysToClose: durationCount > 0 ? durationSum / durationCount : null,
      avgDistributeurLastUpdateDays,
      avgDaysToFirstUpdate: firstUpdateCount > 0 ? firstUpdateSum / firstUpdateCount : null,
    };
  }, [distributeurs, activeDistributeurs]);

  return (
    <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Total leads" value={String(kpis.totalLeads)} accent="cyan" />
      <StatCard label="Distributeurs" value={String(kpis.totalDistributeurs)} accent="cyan" />
      <StatCard label="Open" value={String(kpis.open)} accent="amber" />
      <StatCard label="Working" value={String(kpis.working)} accent="amber" />
      <StatCard label="Won" value={String(kpis.won)} accent="green" />
      <StatCard label="Lost" value={String(kpis.lost)} accent="red" />
      <StatCard label="Win rate" value={formatPercent(kpis.winRate)} accent="green" />
      <StatCard label="Conversion rate" value={formatPercent(kpis.conversionRate)} accent="green" />
      <StatCard label="Avg. days to close" value={formatDays(kpis.avgDaysToClose)} accent="violet" />
      <StatCard label="New (7d)" value={String(kpis.createdLast7Days)} accent="cyan" />
      <StatCard label="New (30d)" value={String(kpis.createdLast30Days)} accent="cyan" />
      <StatCard label="Stale (30d+)" value={String(kpis.staleLeads)} accent="red" />
      <StatCard label="Last update (avg)" value={formatDays(kpis.avgDistributeurLastUpdateDays)} accent="violet" />
      <StatCard label="Time to update (avg)" value={formatDays(kpis.avgDaysToFirstUpdate)} accent="violet" />
    </section>
  );
}
