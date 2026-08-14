import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import type { SourceByDistributeur } from 'shared/types/stats';
import { stackedTotalLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import type { Drilldown } from './statsChartUtils';
import { makeCategoryClickHandler, sortCategoriesByTotal, sortDistributeursByImpact, stackedBarOptions } from './statsChartUtils';

interface LeadSourceSectionProps {
  sourceByDistributeur: SourceByDistributeur;
  activeDistributeurs: Set<string>;
  onDrilldown: (drilldown: Drilldown | null) => void;
  groupLabel?: string;
}

export function LeadSourceSection({ sourceByDistributeur, activeDistributeurs, onDrilldown, groupLabel = 'distributeur' }: LeadSourceSectionProps) {
  const { sources, counts } = sourceByDistributeur;

  const sourceData: ChartData<'bar'> = useMemo(() => {
    const distributeurs = sortDistributeursByImpact(
      sourceByDistributeur.distributeurs.filter((d) => activeDistributeurs.has(d)),
      counts,
    );
    const orderedSources = sortCategoriesByTotal(sources, distributeurs, counts);
    return {
      labels: orderedSources,
      datasets: distributeurs.map((distributeur) => ({
        label: distributeur,
        data: orderedSources.map((source) => counts[distributeur]?.[sources.indexOf(source)] ?? 0),
        backgroundColor: colorForDistributeur(distributeur, 0.8),
        stack: 'source',
      })),
    };
  }, [sourceByDistributeur, sources, counts, activeDistributeurs]);

  return (
    <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Lead source</h2>
        <p className="text-xs text-slate-500">Click a column to zoom into its {groupLabel} breakdown</p>
      </div>
      <div className="mt-4 h-96">
        <Bar
          data={sourceData}
          options={{
            ...stackedBarOptions,
            onClick: makeCategoryClickHandler(sources, sourceByDistributeur.distributeurs, counts, 'Lead source', activeDistributeurs, onDrilldown),
          }}
          plugins={[stackedTotalLabelPlugin()]}
        />
      </div>
    </section>
  );
}
