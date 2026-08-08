import { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import type { ActiveElement, ChartData, ChartEvent, ChartOptions, Chart as ChartJs } from 'chart.js';
import { useStats } from '../../api/stats';
import { PageNav } from '../../components/PageNav';
import { StatCard } from './StatCard';
import { DistributeurFilter } from './DistributeurFilter';
import { colorForDistributeur } from './distributeurColors';
import { stackedTotalLabelPlugin, valueLabelPlugin } from './chartSetup';

// Chart.js empile les datasets dans l'ordre du tableau, le premier au plus près de la base — donc
// trier par impact desc (le plus gros en premier) place bien le plus gros en bas de la pile.
function sortDistributeursByImpact(distributeurs: string[], counts: Record<string, number[]>): string[] {
  return [...distributeurs].sort((a, b) => {
    const totalA = (counts[a] ?? []).reduce((sum, value) => sum + value, 0);
    const totalB = (counts[b] ?? []).reduce((sum, value) => sum + value, 0);
    if (totalB !== totalA) return totalB - totalA;
    return a.localeCompare(b);
  });
}

// Ordre des catégories sur l'axe X (statuts, produits, sources) : plus gros total à gauche, plus
// petit à droite, alphabétique en cas d'égalité — calculé sur les distributeurs actuellement
// affichés, pas sur le total global, pour que le tri suive le filtre.
function sortCategoriesByTotal(categories: string[], distributeurs: string[], counts: Record<string, number[]>): string[] {
  return [...categories].sort((a, b) => {
    const indexA = categories.indexOf(a);
    const indexB = categories.indexOf(b);
    const totalA = distributeurs.reduce((sum, d) => sum + (counts[d]?.[indexA] ?? 0), 0);
    const totalB = distributeurs.reduce((sum, d) => sum + (counts[d]?.[indexB] ?? 0), 0);
    if (totalB !== totalA) return totalB - totalA;
    return a.localeCompare(b);
  });
}

interface DrilldownEntry {
  distributeur: string;
  value: number;
}

interface Drilldown {
  title: string;
  entries: DrilldownEntry[];
}

function buildDrilldownEntries(distributeurs: string[], counts: Record<string, number[]>, categoryIndex: number, activeDistributeurs: Set<string>): DrilldownEntry[] {
  return distributeurs
    .filter((d) => activeDistributeurs.has(d))
    .map((distributeur) => ({ distributeur, value: counts[distributeur]?.[categoryIndex] ?? 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.distributeur.localeCompare(b.distributeur));
}

// Clic sur une barre empilée : chart.js ne dit que quel segment a été touché, alors qu'on veut la
// catégorie entière (toute la colonne) — `getElementsAtEventForMode(..., 'index', ...)` redonne
// l'index de colonne quel que soit le segment cliqué.
function makeCategoryClickHandler(
  categories: string[],
  distributeurs: string[],
  counts: Record<string, number[]>,
  titlePrefix: string,
  activeDistributeurs: Set<string>,
  setDrilldown: (drilldown: Drilldown | null) => void,
) {
  return (event: ChartEvent, _elements: ActiveElement[], chart: ChartJs) => {
    const nativeEvent = event.native;
    if (!nativeEvent) return;
    const points = chart.getElementsAtEventForMode(nativeEvent, 'index', { intersect: false }, true);
    if (points.length === 0) return;
    const category = categories[points[0].index];
    if (!category) return;
    const entries = buildDrilldownEntries(distributeurs, counts, categories.indexOf(category), activeDistributeurs);
    if (entries.length === 0) return;
    setDrilldown({ title: `${titlePrefix} — ${category}`, entries });
  };
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatDays(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}j`;
}

const GRID_COLOR = 'rgba(148, 163, 184, 0.12)';

const COMPARISON_METRICS = {
  total: { label: 'Total leads', format: (value: number) => String(value) },
  winRate: { label: 'Win rate', format: (value: number) => `${value}%` },
  avgDaysToClose: { label: 'Avg. days to close', format: (value: number) => `${value.toFixed(1)}j` },
} as const;

type ComparisonSortKey = keyof typeof COMPARISON_METRICS;

export function StatsPage() {
  const { data: stats, isPending, isError } = useStats();
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const allDistributeurs = useMemo(() => stats?.distributeurs.map((d) => d.distributeur) ?? [], [stats]);
  const [selectedDistributeurs, setSelectedDistributeurs] = useState<Set<string> | null>(null);

  const activeDistributeurs = useMemo(() => {
    // Par défaut, tout le monde : le filtre conditionne tous les graphes de la page, donc l'état
    // initial doit correspondre à "aucun filtre appliqué", pas à une sélection arbitraire.
    if (selectedDistributeurs) return selectedDistributeurs;
    return new Set(allDistributeurs);
  }, [selectedDistributeurs, allDistributeurs]);

  // Recalculé côté client à partir des agrégats par distributeur plutôt que de refaire un appel
  // réseau à chaque clic de filtre — `stats.distributeurs` porte déjà tout ce qu'il faut par
  // distributeur (cf. DistributeurStat côté back).
  const filteredKpis = useMemo(() => {
    if (!stats) return null;
    const selected = stats.distributeurs.filter((d) => activeDistributeurs.has(d.distributeur));
    const sum = (key: 'total' | 'open' | 'working' | 'won' | 'lost' | 'createdLast7Days' | 'createdLast30Days' | 'staleLeads') =>
      selected.reduce((acc, d) => acc + d[key], 0);
    const won = sum('won');
    const lost = sum('lost');
    const durationSum = selected.reduce((acc, d) => acc + (d.avgDaysToClose ?? 0) * d.daysToCloseCount, 0);
    const durationCount = selected.reduce((acc, d) => acc + d.daysToCloseCount, 0);

    return {
      totalLeads: sum('total'),
      totalDistributeurs: selected.length,
      open: sum('open'),
      working: sum('working'),
      won,
      lost,
      winRate: won + lost > 0 ? won / (won + lost) : null,
      createdLast7Days: sum('createdLast7Days'),
      createdLast30Days: sum('createdLast30Days'),
      staleLeads: sum('staleLeads'),
      avgDaysToClose: durationCount > 0 ? durationSum / durationCount : null,
    };
  }, [stats, activeDistributeurs]);

  const statusData: ChartData<'bar'> | null = useMemo(() => {
    if (!stats) return null;
    const { statuses, counts } = stats.statusByDistributeur;
    const distributeurs = sortDistributeursByImpact(
      stats.statusByDistributeur.distributeurs.filter((d) => activeDistributeurs.has(d)),
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
  }, [stats, activeDistributeurs]);

  const trendData: ChartData<'line'> | null = useMemo(() => {
    if (!stats) return null;
    const series = stats.trend.byDistributeur.filter((s) => activeDistributeurs.has(s.distributeur));
    return {
      labels: stats.trend.weeks,
      datasets: [
        {
          label: 'Total',
          data: stats.trend.total,
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
  }, [stats, activeDistributeurs]);

  const productData: ChartData<'bar'> | null = useMemo(() => {
    if (!stats) return null;
    const { products, counts } = stats.productsByDistributeur;
    const distributeurs = sortDistributeursByImpact(
      stats.productsByDistributeur.distributeurs.filter((d) => activeDistributeurs.has(d)),
      counts,
    );
    const orderedProducts = sortCategoriesByTotal(products, distributeurs, counts);
    return {
      labels: orderedProducts,
      datasets: distributeurs.map((distributeur) => ({
        label: distributeur,
        data: orderedProducts.map((product) => counts[distributeur]?.[products.indexOf(product)] ?? 0),
        backgroundColor: colorForDistributeur(distributeur, 0.8),
        stack: 'products',
      })),
    };
  }, [stats, activeDistributeurs]);

  const sourceData: ChartData<'bar'> | null = useMemo(() => {
    if (!stats) return null;
    const { sources, counts } = stats.sourceByDistributeur;
    const distributeurs = sortDistributeursByImpact(
      stats.sourceByDistributeur.distributeurs.filter((d) => activeDistributeurs.has(d)),
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
  }, [stats, activeDistributeurs]);

  const stackedBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
    scales: {
      x: { grid: { color: GRID_COLOR }, stacked: true },
      y: { grid: { color: GRID_COLOR }, stacked: true, beginAtZero: true, grace: '8%' },
    },
  };

  const lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
    scales: {
      x: { grid: { color: GRID_COLOR } },
      y: { grid: { color: GRID_COLOR }, beginAtZero: true },
    },
  };

  const [sortKey, setSortKey] = useState<ComparisonSortKey>('total');
  const sortedDistributeurs = useMemo(() => {
    if (!stats) return [];
    return stats.distributeurs
      .filter((d) => activeDistributeurs.has(d.distributeur))
      .sort((a, b) => {
        const aValue = a[sortKey] ?? -1;
        const bValue = b[sortKey] ?? -1;
        return bValue - aValue;
      });
  }, [stats, sortKey, activeDistributeurs]);

  const comparisonData: ChartData<'bar'> | null = useMemo(() => {
    if (!stats) return null;
    return {
      labels: sortedDistributeurs.map((d) => d.distributeur),
      datasets: [
        {
          label: COMPARISON_METRICS[sortKey].label,
          data: sortedDistributeurs.map((d) => {
            if (sortKey === 'total') return d.total;
            if (sortKey === 'winRate') return Math.round((d.winRate ?? 0) * 100);
            return d.avgDaysToClose ?? 0;
          }),
          backgroundColor: sortedDistributeurs.map((d) => colorForDistributeur(d.distributeur, 0.75)),
          borderRadius: 6,
        },
      ],
    };
  }, [stats, sortedDistributeurs, sortKey]);

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

  const drilldownData: ChartData<'bar'> | null = useMemo(() => {
    if (!drilldown) return null;
    return {
      labels: drilldown.entries.map((entry) => entry.distributeur),
      datasets: [
        {
          label: drilldown.title,
          data: drilldown.entries.map((entry) => entry.value),
          backgroundColor: drilldown.entries.map((entry) => colorForDistributeur(entry.distributeur, 0.8)),
          borderRadius: 4,
        },
      ],
    };
  }, [drilldown]);

  const drilldownOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: GRID_COLOR }, beginAtZero: true, grace: '10%' },
      y: { grid: { color: GRID_COLOR } },
    },
  };

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

      {stats && filteredKpis && (
        <>
          <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Distributeur filter</h2>
              <p className="text-xs text-slate-500">Conditions every KPI, chart and table below</p>
            </div>
            <div className="mt-4">
              <DistributeurFilter distributeurs={allDistributeurs} selected={activeDistributeurs} onChange={setSelectedDistributeurs} />
            </div>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total leads" value={String(filteredKpis.totalLeads)} accent="cyan" />
            <StatCard label="Distributeurs" value={String(filteredKpis.totalDistributeurs)} accent="cyan" />
            <StatCard label="Open" value={String(filteredKpis.open)} accent="amber" />
            <StatCard label="Working" value={String(filteredKpis.working)} accent="amber" />
            <StatCard label="Won" value={String(filteredKpis.won)} accent="green" />
            <StatCard label="Lost" value={String(filteredKpis.lost)} accent="red" />
            <StatCard label="Win rate" value={formatPercent(filteredKpis.winRate)} accent="green" />
            <StatCard label="Avg. days to close" value={formatDays(filteredKpis.avgDaysToClose)} accent="violet" />
            <StatCard label="New (7d)" value={String(filteredKpis.createdLast7Days)} accent="cyan" />
            <StatCard label="New (30d)" value={String(filteredKpis.createdLast30Days)} accent="cyan" />
            <StatCard label="Stale (30d+)" value={String(filteredKpis.staleLeads)} accent="red" />
          </section>

          <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Pipeline by status</h2>
              <p className="text-xs text-slate-500">Click a column to zoom into its distributeur breakdown</p>
            </div>
            <div className="mt-4 h-96">
              {statusData && (
                <Bar
                  data={statusData}
                  options={{
                    ...stackedBarOptions,
                    onClick: makeCategoryClickHandler(
                      stats.statusByDistributeur.statuses,
                      stats.statusByDistributeur.distributeurs,
                      stats.statusByDistributeur.counts,
                      'Pipeline by status',
                      activeDistributeurs,
                      setDrilldown,
                    ),
                  }}
                  plugins={[stackedTotalLabelPlugin()]}
                />
              )}
            </div>
          </section>

          <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
            <h2 className="text-lg font-semibold text-slate-100">Leads created per week — trend by distributeur</h2>
            <div className="mt-4 h-80">{trendData && <Line data={trendData} options={lineOptions} />}</div>
          </section>

          <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Distributeur comparison</h2>
              <div className="flex gap-2 text-xs">
                {(['total', 'winRate', 'avgDaysToClose'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortKey(key)}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 ${sortKey === key ? 'border-neon-violet text-neon-violet' : 'border-slate-700 text-slate-400'}`}
                  >
                    Sort by {key === 'total' ? 'volume' : key === 'winRate' ? 'win rate' : 'avg days to close'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 h-64 overflow-x-auto">
              <div style={{ minWidth: `${Math.max(sortedDistributeurs.length * 64, 100)}px` }} className="h-full">
                {comparisonData && (
                  <Bar data={comparisonData} options={comparisonOptions} plugins={[valueLabelPlugin(COMPARISON_METRICS[sortKey].format)]} />
                )}
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs tracking-wide text-slate-500 uppercase">
                    <th className="py-2 pr-4">Distributeur</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-4">Active</th>
                    <th className="py-2 pr-4">Won</th>
                    <th className="py-2 pr-4">Lost</th>
                    <th className="py-2 pr-4">Win rate</th>
                    <th className="py-2 pr-4">Avg. days to close</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Product interest by distributeur</h2>
              <p className="text-xs text-slate-500">Click a column to zoom into its distributeur breakdown</p>
            </div>
            <div className="mt-4 h-96">
              {productData && (
                <Bar
                  data={productData}
                  options={{
                    ...stackedBarOptions,
                    onClick: makeCategoryClickHandler(
                      stats.productsByDistributeur.products,
                      stats.productsByDistributeur.distributeurs,
                      stats.productsByDistributeur.counts,
                      'Product interest',
                      activeDistributeurs,
                      setDrilldown,
                    ),
                  }}
                  plugins={[stackedTotalLabelPlugin()]}
                />
              )}
            </div>
          </section>

          <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Lead source</h2>
              <p className="text-xs text-slate-500">Click a column to zoom into its distributeur breakdown</p>
            </div>
            <div className="mt-4 h-96">
              {sourceData && (
                <Bar
                  data={sourceData}
                  options={{
                    ...stackedBarOptions,
                    onClick: makeCategoryClickHandler(
                      stats.sourceByDistributeur.sources,
                      stats.sourceByDistributeur.distributeurs,
                      stats.sourceByDistributeur.counts,
                      'Lead source',
                      activeDistributeurs,
                      setDrilldown,
                    ),
                  }}
                  plugins={[stackedTotalLabelPlugin()]}
                />
              )}
            </div>
          </section>
        </>
      )}

      {drilldown && drilldownData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6" onClick={() => setDrilldown(null)}>
          <div className="glass-panel glow-violet w-full max-w-2xl rounded-2xl px-8 py-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">{drilldown.title}</h2>
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="cursor-pointer rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-neon-cyan"
              >
                Close
              </button>
            </div>
            <div className="mt-4 max-h-[70vh] overflow-y-auto" style={{ height: `${Math.max(drilldown.entries.length * 32, 120)}px` }}>
              <Bar data={drilldownData} options={drilldownOptions} plugins={[valueLabelPlugin((value) => String(value), true)]} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
