import { useMemo, useState } from 'react';
import { useStats } from '../../api/stats';
import { PageNav } from '../../components/PageNav';
import { DistributeurComparisonSection } from './DistributeurComparisonSection';
import type { GroupBy } from './DistributeurFilterSection';
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
  const [groupBy, setGroupBy] = useState<GroupBy>('distributeur');

  const allDistributeurs = useMemo(() => stats?.distributeurs.map((d) => d.distributeur) ?? [], [stats]);
  const regions = useMemo(() => stats?.regions.map((r) => r.distributeur) ?? [], [stats]);

  // Inverse de `regionByDistributeur` (nom de distributeur -> région) : sert à la fois au filtre "par
  // région" (quels distributeurs cocher/décocher quand on clique une région) et à dériver `activeRegions`
  // ci-dessous — le filtre reste toujours exprimé en noms de distributeurs en interne.
  const regionMembers = useMemo(() => {
    const members: Record<string, string[]> = {};
    if (!stats) return members;
    for (const [distributeur, region] of Object.entries(stats.regionByDistributeur)) {
      (members[region] ??= []).push(distributeur);
    }
    return members;
  }, [stats]);

  const activeDistributeurs = useMemo(() => {
    // Par défaut, tout le monde : le filtre conditionne tous les graphes de la page, donc l'état
    // initial doit correspondre à "aucun filtre appliqué", pas à une sélection arbitraire.
    if (selectedDistributeurs) return selectedDistributeurs;
    return new Set(allDistributeurs);
  }, [selectedDistributeurs, allDistributeurs]);

  // Une région compte comme "active" seulement si tous ses distributeurs le sont — cohérent avec le
  // clic sur un bouton de région dans DistributeurFilter, qui (dé)sélectionne le groupe entier.
  const activeRegions = useMemo(
    () => new Set(regions.filter((region) => (regionMembers[region] ?? []).every((distributeur) => activeDistributeurs.has(distributeur)))),
    [regions, regionMembers, activeDistributeurs],
  );

  const groupLabel = groupBy === 'distributeur' ? 'distributeur' : 'region';
  const activeGroups = groupBy === 'distributeur' ? activeDistributeurs : activeRegions;
  const comparisonStats = stats ? (groupBy === 'distributeur' ? stats.distributeurs : stats.regions) : [];
  const statusData = stats ? (groupBy === 'distributeur' ? stats.statusByDistributeur : stats.statusByRegion) : undefined;
  const sourceData = stats ? (groupBy === 'distributeur' ? stats.sourceByDistributeur : stats.sourceByRegion) : undefined;
  const productsData = stats ? (groupBy === 'distributeur' ? stats.productsByDistributeur : stats.productsByRegion) : undefined;
  const productConversionData = stats ? (groupBy === 'distributeur' ? stats.productConversionByDistributeur : stats.productConversionByRegion) : undefined;
  const stageVelocityData = stats ? (groupBy === 'distributeur' ? stats.stageVelocity : stats.stageVelocityByRegion) : undefined;

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

      {stats && statusData && sourceData && productsData && productConversionData && stageVelocityData && (
        <>
          <DistributeurFilterSection
            distributeurs={allDistributeurs}
            regions={regions}
            regionMembers={regionMembers}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            selected={activeDistributeurs}
            onChange={setSelectedDistributeurs}
          />

          <KpiSection distributeurs={stats.distributeurs} activeDistributeurs={activeDistributeurs} />

          <PipelineStatusSection statusByDistributeur={statusData} activeDistributeurs={activeGroups} onDrilldown={setDrilldown} groupLabel={groupLabel} />

          {SHOW_LEAD_TREND && <TrendSection trend={stats.trend} activeDistributeurs={activeDistributeurs} />}

          <DistributeurComparisonSection distributeurs={comparisonStats} activeDistributeurs={activeGroups} groupLabel={groupLabel === 'region' ? 'Region' : 'Distributeur'} />

          <StageVelocitySection stageVelocity={stageVelocityData} distributeurs={comparisonStats} activeDistributeurs={activeGroups} />

          <ProductByDistributeurSection
            productsByDistributeur={productsData}
            productConversionByDistributeur={productConversionData}
            distributeurStats={comparisonStats}
            activeDistributeurs={activeGroups}
            onDrilldown={setDrilldown}
            groupLabel={groupLabel}
          />

          <LeadSourceSection sourceByDistributeur={sourceData} activeDistributeurs={activeGroups} onDrilldown={setDrilldown} groupLabel={groupLabel} />
        </>
      )}

      {drilldown && <DrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} />}
    </main>
  );
}
