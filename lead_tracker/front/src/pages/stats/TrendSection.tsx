import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import type { StatsTrend } from 'shared/types/stats';
import { colorForDistributeur } from './distributeurColors';
import { lineOptions } from './statsChartUtils';

interface TrendSectionProps {
  trend: StatsTrend;
  activeDistributeurs: Set<string>;
}

export function TrendSection({ trend, activeDistributeurs }: TrendSectionProps) {
  const trendData: ChartData<'line'> = useMemo(() => {
    const series = trend.byDistributeur.filter((s) => activeDistributeurs.has(s.distributeur));
    return {
      labels: trend.weeks,
      datasets: [
        {
          label: 'Total',
          data: trend.total,
          borderColor: '#e2e8f0',
          backgroundColor: 'rgba(226, 232, 240, 0.1)',
          borderWidth: 2,
          borderDash: [4, 3],
          pointRadius: 2,
          tension: 0.25,
        },
        ...series.map((s) => ({
          label: s.distributeur,
          data: s.counts,
          borderColor: colorForDistributeur(s.distributeur),
          backgroundColor: colorForDistributeur(s.distributeur, 0.12),
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
        })),
      ],
    };
  }, [trend, activeDistributeurs]);

  return (
    <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
      <h2 className="text-lg font-semibold text-slate-100">Leads created per week — trend by distributeur</h2>
      <div className="mt-4 h-80">
        <Line data={trendData} options={lineOptions} />
      </div>
    </section>
  );
}
