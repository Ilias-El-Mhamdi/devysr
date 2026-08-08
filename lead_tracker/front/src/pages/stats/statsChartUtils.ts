import type { ActiveElement, ChartEvent, ChartOptions, Chart as ChartJs } from 'chart.js';

export const GRID_COLOR = 'rgba(148, 163, 184, 0.12)';

export const stackedBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
  scales: {
    x: { grid: { color: GRID_COLOR }, stacked: true },
    y: { grid: { color: GRID_COLOR }, stacked: true, beginAtZero: true, grace: '8%' },
  },
};

export const lineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
  scales: {
    x: { grid: { color: GRID_COLOR } },
    y: { grid: { color: GRID_COLOR }, beginAtZero: true },
  },
};

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function formatDays(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}j`;
}

const STATUS_SHORT_LABEL: Record<string, string> = {
  'Open - Not Contacted': 'Open',
  'Working - Contacted': 'Working',
  'Closed - Converted': 'Won',
  'Closed - Not Converted': 'Lost',
};

export function shortStatus(status: string): string {
  return STATUS_SHORT_LABEL[status] ?? status;
}

export function transitionKey(from: string, to: string): string {
  return `${from}|${to}`;
}

// Chart.js empile les datasets dans l'ordre du tableau, le premier au plus près de la base — donc
// trier par impact desc (le plus gros en premier) place bien le plus gros en bas de la pile.
export function sortDistributeursByImpact(distributeurs: string[], counts: Record<string, number[]>): string[] {
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
export function sortCategoriesByTotal(categories: string[], distributeurs: string[], counts: Record<string, number[]>): string[] {
  return [...categories].sort((a, b) => {
    const indexA = categories.indexOf(a);
    const indexB = categories.indexOf(b);
    const totalA = distributeurs.reduce((sum, d) => sum + (counts[d]?.[indexA] ?? 0), 0);
    const totalB = distributeurs.reduce((sum, d) => sum + (counts[d]?.[indexB] ?? 0), 0);
    if (totalB !== totalA) return totalB - totalA;
    return a.localeCompare(b);
  });
}

export interface DrilldownEntry {
  distributeur: string;
  value: number;
}

export interface Drilldown {
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
export function makeCategoryClickHandler(
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
