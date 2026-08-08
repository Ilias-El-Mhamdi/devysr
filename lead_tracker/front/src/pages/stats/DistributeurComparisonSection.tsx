import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { DistributeurStat } from 'shared/types/stats';
import { valueLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import { formatDays, formatPercent, GRID_COLOR } from './statsChartUtils';

const COMPARISON_METRICS = {
  total: { label: 'Total leads', shortLabel: 'volume', format: (value: number) => String(value), ascending: false },
  winRate: { label: 'Win rate', shortLabel: 'win rate', format: (value: number) => `${value}%`, ascending: false },
  avgDaysToClose: { label: 'Avg. days to close', shortLabel: 'avg days to close', format: (value: number) => `${value.toFixed(1)}j`, ascending: false },
  // Plus petit = mis à jour plus récemment = "meilleur" ici, contrairement aux autres métriques où
  // le plus gros est mis en avant — on trie donc en ascendant, pas par cohérence avec les autres.
  lastUpdateDaysAgo: { label: 'Last update (avg)', shortLabel: 'last update', format: (value: number) => `${value.toFixed(1)}j`, ascending: true },
} as const;

type ComparisonSortKey = keyof typeof COMPARISON_METRICS;

interface DistributeurComparisonSectionProps {
  distributeurs: DistributeurStat[];
  activeDistributeurs: Set<string>;
}

export function DistributeurComparisonSection({ distributeurs, activeDistributeurs }: DistributeurComparisonSectionProps) {
  const [sortKey, setSortKey] = useState<ComparisonSortKey>('total');

  const sortedDistributeurs = useMemo(() => {
    const { ascending } = COMPARISON_METRICS[sortKey];
    // null = pas de donnée : toujours relégué en dernier, quel que soit le sens du tri.
    const missingValueFallback = ascending ? Infinity : -1;
    return distributeurs
      .filter((d) => activeDistributeurs.has(d.distributeur))
      .sort((a, b) => {
        const aValue = a[sortKey] ?? missingValueFallback;
        const bValue = b[sortKey] ?? missingValueFallback;
        const diff = ascending ? aValue - bValue : bValue - aValue;
        return diff !== 0 ? diff : a.distributeur.localeCompare(b.distributeur);
      });
  }, [distributeurs, sortKey, activeDistributeurs]);

  const comparisonData: ChartData<'bar'> = useMemo(
    () => ({
      labels: sortedDistributeurs.map((d) => d.distributeur),
      datasets: [
        {
          label: COMPARISON_METRICS[sortKey].label,
          data: sortedDistributeurs.map((d) => {
            if (sortKey === 'total') return d.total;
            if (sortKey === 'winRate') return Math.round((d.winRate ?? 0) * 100);
            if (sortKey === 'lastUpdateDaysAgo') return d.lastUpdateDaysAgo ?? 0;
            return d.avgDaysToClose ?? 0;
          }),
          backgroundColor: sortedDistributeurs.map((d) => colorForDistributeur(d.distributeur, 0.75)),
          borderRadius: 6,
        },
      ],
    }),
    [sortedDistributeurs, sortKey],
  );

  const comparisonOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } },
        y: { grid: { color: GRID_COLOR }, beginAtZero: true, ...(sortKey === 'winRate' ? { suggestedMax: 110, max: 110 } : {}) },
      },
    }),
    [sortKey],
  );

  return (
    <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Distributeur comparison</h2>
        <div className="flex gap-2 text-xs">
          {(Object.keys(COMPARISON_METRICS) as ComparisonSortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              className={`cursor-pointer rounded-md border px-2.5 py-1 ${sortKey === key ? 'border-neon-violet text-neon-violet' : 'border-slate-700 text-slate-400'}`}
            >
              Sort by {COMPARISON_METRICS[key].shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64 overflow-x-auto">
        <div style={{ minWidth: `${Math.max(sortedDistributeurs.length * 64, 100)}px` }} className="h-full">
          <Bar data={comparisonData} options={comparisonOptions} plugins={[valueLabelPlugin(COMPARISON_METRICS[sortKey].format)]} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs tracking-wide text-slate-500 uppercase">
              <th className="py-2 pr-4">Distributeur</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Active</th>
              <th className="py-2 pr-4">Won</th>
              <th className="py-2 pr-4">Lost</th>
              <th className="py-2 pr-4">Win rate</th>
              <th className="py-2 pr-4">Avg. days to close</th>
              <th className="py-2 pr-4">Last update</th>
            </tr>
          </thead>
          <tbody>
            {sortedDistributeurs.map((d) => (
              <tr key={d.distributeur} className="border-b border-slate-900">
                <td className="py-2 pr-4">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: colorForDistributeur(d.distributeur) }} />
                  {d.distributeur}
                </td>
                <td className="py-2 pr-4 text-slate-300">{d.total}</td>
                <td className="py-2 pr-4 text-neon-amber">{d.active}</td>
                <td className="py-2 pr-4 text-neon-green">{d.won}</td>
                <td className="py-2 pr-4 text-neon-red">{d.lost}</td>
                <td className="py-2 pr-4 text-slate-300">{formatPercent(d.winRate)}</td>
                <td className="py-2 pr-4 text-slate-300">{formatDays(d.avgDaysToClose)}</td>
                <td className="py-2 pr-4 text-slate-300">{formatDays(d.lastUpdateDaysAgo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
