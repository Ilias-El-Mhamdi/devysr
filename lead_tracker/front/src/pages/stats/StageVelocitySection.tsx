import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { DistributeurStat, StageVelocity } from 'shared/types/stats';
import { valueLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import { GRID_COLOR, shortStatus, transitionKey } from './statsChartUtils';

interface StageVelocitySectionProps {
  stageVelocity: StageVelocity;
  distributeurs: DistributeurStat[];
  activeDistributeurs: Set<string>;
}

const velocityOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: GRID_COLOR }, ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } },
    y: { grid: { color: GRID_COLOR }, beginAtZero: true, grace: '10%' },
  },
};

export function StageVelocitySection({ stageVelocity, distributeurs, activeDistributeurs }: StageVelocitySectionProps) {
  const [transitionIndex, setTransitionIndex] = useState(0);
  const [metric, setMetric] = useState<'medianDays' | 'avgDays'>('medianDays');
  const transition = stageVelocity.transitions[transitionIndex] ?? null;

  const rows = useMemo(() => {
    const totalByDistributeur = new Map(distributeurs.map((d) => [d.distributeur, d.total]));
    return stageVelocity.byDistributeur
      .filter((d) => activeDistributeurs.has(d.distributeur))
      .sort((a, b) => (totalByDistributeur.get(b.distributeur) ?? 0) - (totalByDistributeur.get(a.distributeur) ?? 0) || a.distributeur.localeCompare(b.distributeur));
  }, [stageVelocity, distributeurs, activeDistributeurs]);

  const barData: ChartData<'bar'> | null = useMemo(() => {
    if (!transition) return null;
    const bars = rows
      .map((d) => {
        const entry = d.transitions.find((t) => t.from === transition.from && t.to === transition.to);
        return { distributeur: d.distributeur, value: entry?.[metric] ?? null };
      })
      .filter((row): row is { distributeur: string; value: number } => row.value !== null)
      .sort((a, b) => b.value - a.value || a.distributeur.localeCompare(b.distributeur));

    return {
      labels: bars.map((row) => row.distributeur),
      datasets: [
        {
          label: `${shortStatus(transition.from)} → ${shortStatus(transition.to)}`,
          data: bars.map((row) => row.value),
          backgroundColor: bars.map((row) => colorForDistributeur(row.distributeur, 0.75)),
          borderRadius: 6,
        },
      ],
    };
  }, [rows, transition, metric]);

  return (
    <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Stage velocity</h2>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMetric('medianDays')}
            className={`cursor-pointer rounded-md border px-2.5 py-1 ${metric === 'medianDays' ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400'}`}
          >
            Median
          </button>
          <button
            type="button"
            onClick={() => setMetric('avgDays')}
            className={`cursor-pointer rounded-md border px-2.5 py-1 ${metric === 'avgDays' ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400'}`}
          >
            Average
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        How long it takes leads to move from one stage to another — median is less skewed by a few leads stuck for a long time.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {stageVelocity.transitions.map((t, index) => (
          <button
            key={transitionKey(t.from, t.to)}
            type="button"
            onClick={() => setTransitionIndex(index)}
            className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${
              transitionIndex === index ? 'border-neon-violet text-neon-violet' : 'border-slate-700 text-slate-400'
            }`}
          >
            {shortStatus(t.from)} → {shortStatus(t.to)}
          </button>
        ))}
      </div>

      <div className="mt-4 h-64 overflow-x-auto">
        <div style={{ minWidth: `${Math.max((barData?.labels?.length ?? 0) * 64, 100)}px` }} className="h-full">
          {barData && barData.labels && barData.labels.length > 0 ? (
            <Bar data={barData} options={velocityOptions} plugins={[valueLabelPlugin((value) => `${value.toFixed(1)}j`)]} />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-slate-500">No lead has made this transition yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
