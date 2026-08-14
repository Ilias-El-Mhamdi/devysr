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

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

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

// Même principe que sortDistributeursByImpact, mais pour un empilement en taux de conversion : la
// somme des % par produit n'a pas de sens comme critère de tri (ça favorise un distributeur présent
// sur beaucoup de produits plutôt que celui qui convertit vraiment le mieux), donc on trie sur le
// taux de conversion global du distributeur (même valeur que "Distributeur comparison") — le
// meilleur convertisseur se retrouve en bas de chaque colonne.
export function sortDistributeursByConversionRate(distributeurs: string[], conversionRateByDistributeur: Map<string, number | null>): string[] {
  return [...distributeurs].sort((a, b) => {
    const rateA = conversionRateByDistributeur.get(a) ?? -1;
    const rateB = conversionRateByDistributeur.get(b) ?? -1;
    if (rateB !== rateA) return rateB - rateA;
    return a.localeCompare(b);
  });
}

// Pour un empilement où l'ordre n'a de sens QUE colonne par colonne (ex. taux de conversion produit
// par produit — contrairement au volume, il n'y a pas de "meilleur distributeur toutes colonnes
// confondues" qui vaille de placer la même pile partout) : classe les distributeurs indépendamment
// pour chaque catégorie, valeur décroissante en tête (donc en bas de la pile une fois rendu). Le
// résultat n'est donc plus un ordre unique mais un classement par colonne — à consommer avec des
// datasets "par rang" plutôt que "par distributeur" (cf. ProductByDistributeurSection en mode
// conversion).
//
// `rawIndexByColumn[i]` = index de la i-ème colonne AFFICHÉE (après tri par sortCategoriesByTotal)
// dans le tableau `counts` d'origine (indexé, lui, dans l'ordre brut renvoyé par le back) — sans
// cette traduction, classer "colonne affichée n°i" reviendrait à lire `counts[...][i]`, qui pointe
// en réalité sur la i-ème catégorie de l'ordre BRUT, pas de l'ordre affiché.
export function rankDistributeursPerCategory(distributeurs: string[], counts: Record<string, number[]>, rawIndexByColumn: number[]): string[][] {
  return rawIndexByColumn.map((rawIndex) =>
    [...distributeurs].sort((a, b) => {
      const valueA = counts[a]?.[rawIndex] ?? 0;
      const valueB = counts[b]?.[rawIndex] ?? 0;
      if (valueB !== valueA) return valueB - valueA;
      return a.localeCompare(b);
    }),
  );
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
  formatValue?: (value: number) => string;
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
  formatValue?: (value: number) => string,
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
    setDrilldown({ title: `${titlePrefix} — ${category}`, entries, formatValue });
  };
}
