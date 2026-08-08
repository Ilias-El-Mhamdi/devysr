import { useMemo, useState } from 'react';
import { useStats } from '../../api/stats';
import { PageNav } from '../../components/PageNav';
import { DistributeurComparisonSection } from './DistributeurComparisonSection';
import { DistributeurFilterSection } from './DistributeurFilterSection';
import { DrilldownModal } from './DrilldownModal';
import { KpiSection } from './KpiSection';
import { LeadSourceSection } from './LeadSourceSection';
import { PipelineStatusSection } from './PipelineStatusSection';
import { ProductByDistributeurSection } from './ProductByDistributeurSection';
import { StageVelocitySection } from './StageVelocitySection';
import type { Drilldown } from './statsChartUtils';
import { TrendSection } from './TrendSection';

const SHOW_LEAD_TREND = false;

export function StatsPage() {
  const { data: stats, isPending, isError } = useStats();
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [selectedDistributeurs, setSelectedDistributeurs] = useState<Set<string> | null>(null);

  const allDistributeurs = useMemo(() => stats?.distributeurs.map((d) => d.distributeur) ?? [], [stats]);

  const activeDistributeurs = useMemo(() => {
    // Par défaut, tout le monde : le filtre conditionne tous les graphes de la page, donc l'état
    // initial doit correspondre à "aucun filtre appliqué", pas à une sélection arbitraire.
    if (selectedDistributeurs) return selectedDistributeurs;
    return new Set(allDistributeurs);
  }, [selectedDistributeurs, allDistributeurs]);

  return (
    <main className="min-h-screen px-6 py-12 sm:px-10 lg:px-16">
      <header className="glass-panel glow-cyan rounded-2xl px-8 py-7">
        <div className="flex items-center justify-center gap-4">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-neon-cyan/60 sm:w-20" />
          <h1 className="font-mono-display text-xl font-semibold tracking-[0.35em] text-slate-100 uppercase sm:text-2xl">
            Lead <span className="text-neon-cyan">Stats</span>
          </h1>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-neon-cyan/60 sm:w-20" />
        </div>
        <PageNav />
      </header>

      {isPending && <p className="mt-10 text-center text-slate-400">Loading stats…</p>}
      {isError && <p className="mt-10 text-center text-neon-red">Failed to load stats.</p>}

      {stats && (
        <>
          <DistributeurFilterSection distributeurs={allDistributeurs} selected={activeDistributeurs} onChange={setSelectedDistributeurs} />

          <KpiSection distributeurs={stats.distributeurs} activeDistributeurs={activeDistributeurs} />

          <PipelineStatusSection statusByDistributeur={stats.statusByDistributeur} activeDistributeurs={activeDistributeurs} onDrilldown={setDrilldown} />

          {SHOW_LEAD_TREND && <TrendSection trend={stats.trend} activeDistributeurs={activeDistributeurs} />}

          <DistributeurComparisonSection distributeurs={stats.distributeurs} activeDistributeurs={activeDistributeurs} />

          <StageVelocitySection stageVelocity={stats.stageVelocity} distributeurs={stats.distributeurs} activeDistributeurs={activeDistributeurs} />

          <ProductByDistributeurSection productsByDistributeur={stats.productsByDistributeur} activeDistributeurs={activeDistributeurs} onDrilldown={setDrilldown} />

          <LeadSourceSection sourceByDistributeur={stats.sourceByDistributeur} activeDistributeurs={activeDistributeurs} onDrilldown={setDrilldown} />
        </>
      )}

      {drilldown && <DrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} />}
    </main>
  );
}
