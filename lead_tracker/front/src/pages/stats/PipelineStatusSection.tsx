import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import type { StatusByDistributeur } from 'shared/types/stats';
import { stackedTotalLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import type { Drilldown } from './statsChartUtils';
import { makeCategoryClickHandler, sortCategoriesByTotal, sortDistributeursByImpact, stackedBarOptions } from './statsChartUtils';

interface PipelineStatusSectionProps {
  statusByDistributeur: StatusByDistributeur;
  activeDistributeurs: Set<string>;
  onDrilldown: (drilldown: Drilldown | null) => void;
  groupLabel?: string;
}

export function PipelineStatusSection({ statusByDistributeur, activeDistributeurs, onDrilldown, groupLabel = 'distributeur' }: PipelineStatusSectionProps) {
  const { statuses, counts } = statusByDistributeur;

  const statusData: ChartData<'bar'> = useMemo(() => {
    const distributeurs = sortDistributeursByImpact(
      statusByDistributeur.distributeurs.filter((d) => activeDistributeurs.has(d)),
      counts,
    );
    const orderedStatuses = sortCategoriesByTotal(statuses, distributeurs, counts);
    return {
      labels: orderedStatuses,
      datasets: distributeurs.map((distributeur) => ({
        label: distributeur,
        data: orderedStatuses.map((status) => counts[distributeur]?.[statuses.indexOf(status)] ?? 0),
        backgroundColor: colorForDistributeur(distributeur, 0.8),
        stack: 'status',
      })),
    };
  }, [statusByDistributeur, statuses, counts, activeDistributeurs]);

  return (
    <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Pipeline by status</h2>
        <p className="text-xs text-slate-500">Click a column to zoom into its {groupLabel} breakdown</p>
      </div>
      <div className="mt-4 h-96">
        <Bar
          data={statusData}
          options={{
            ...stackedBarOptions,
            onClick: makeCategoryClickHandler(statuses, statusByDistributeur.distributeurs, counts, 'Pipeline by status', activeDistributeurs, onDrilldown),
          }}
          plugins={[stackedTotalLabelPlugin()]}
        />
      </div>
    </section>
  );
}
