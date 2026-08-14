import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import type { DistributeurStat, ProductsByDistributeur } from 'shared/types/stats';
import { stackedTotalLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import type { Drilldown } from './statsChartUtils';
import {
  makeCategoryClickHandler,
  rankDistributeursPerCategory,
  sortCategoriesByTotal,
  sortDistributeursByConversionRate,
  sortDistributeursByImpact,
  stackedBarOptions,
} from './statsChartUtils';

interface ProductByDistributeurSectionProps {
  productsByDistributeur: ProductsByDistributeur;
  productConversionByDistributeur: ProductsByDistributeur;
  distributeurStats: DistributeurStat[];
  activeDistributeurs: Set<string>;
  onDrilldown: (drilldown: Drilldown | null) => void;
  groupLabel?: string;
}

type ViewMode = 'volume' | 'conversion';

export function ProductByDistributeurSection({
  productsByDistributeur,
  productConversionByDistributeur,
  distributeurStats,
  activeDistributeurs,
  onDrilldown,
  groupLabel = 'distributeur',
}: ProductByDistributeurSectionProps) {
  const [view, setView] = useState<ViewMode>('volume');
  const { products, distributeurs: allDistributeurs, counts } = view === 'volume' ? productsByDistributeur : productConversionByDistributeur;
  const formatValue = view === 'conversion' ? (value: number) => `${value}%` : (value: number) => String(value);
  const conversionRateByDistributeur = useMemo(() => new Map(distributeurStats.map((d) => [d.distributeur, d.conversionRate])), [distributeurStats]);

  // En mode conversion, `legendDistributeurs` sert uniquement à afficher la légende (couleurs +
  // noms) — l'ordre d'empilement réel, lui, est décidé colonne par colonne (cf. plus bas), donc
  // aucun ordre global de distributeurs ne "pilote" le graphe dans ce mode.
  const { productData, legendDistributeurs, distributeurAtPoint } = useMemo(() => {
    const distributeurs =
      view === 'conversion'
        ? sortDistributeursByConversionRate(allDistributeurs.filter((d) => activeDistributeurs.has(d)), conversionRateByDistributeur)
        : sortDistributeursByImpact(allDistributeurs.filter((d) => activeDistributeurs.has(d)), counts);
    const orderedProducts = sortCategoriesByTotal(products, distributeurs, counts);
    const productIndex = orderedProducts.map((product) => products.indexOf(product));

    if (view !== 'conversion') {
      return {
        legendDistributeurs: distributeurs,
        distributeurAtPoint: null,
        productData: {
          labels: orderedProducts,
          datasets: distributeurs.map((distributeur) => ({
            label: distributeur,
            data: productIndex.map((idx) => counts[distributeur]?.[idx] ?? 0),
            backgroundColor: colorForDistributeur(distributeur, 0.8),
            stack: 'products',
          })),
        } satisfies ChartData<'bar'>,
      };
    }

    // Le meilleur convertisseur d'un produit n'est pas forcément le meilleur convertisseur global
    // (cf. sortDistributeursByConversionRate) — donc "le plus gros en bas" ne peut être garanti
    // colonne par colonne qu'en classant chaque colonne indépendamment, puis en construisant un
    // dataset par RANG (le rang 0 porte, pour chaque produit, la valeur du distributeur classé en
    // tête sur CE produit, quel qu'il soit) plutôt qu'un dataset par distributeur.
    const rankedByProduct = rankDistributeursPerCategory(distributeurs, counts, productIndex);
    // Indexé [datasetIndex(=rang)][dataIndex(=produit)] pour matcher directement la forme des
    // callbacks chart.js (context.datasetIndex / context.dataIndex).
    const grid: (string | null)[][] = distributeurs.map((_, rank) => rankedByProduct.map((ranked) => ranked[rank] ?? null));

    return {
      legendDistributeurs: distributeurs,
      distributeurAtPoint: grid,
      productData: {
        labels: orderedProducts,
        datasets: distributeurs.map((_, rank) => ({
          label: `rank-${rank}`,
          data: orderedProducts.map((_, productPosition) => {
            const distributeur = rankedByProduct[productPosition][rank];
            return distributeur ? (counts[distributeur]?.[productIndex[productPosition]] ?? 0) : 0;
          }),
          backgroundColor: orderedProducts.map((_, productPosition) => {
            const distributeur = rankedByProduct[productPosition][rank];
            return distributeur ? colorForDistributeur(distributeur, 0.8) : 'transparent';
          }),
          stack: 'products',
        })),
      } satisfies ChartData<'bar'>,
    };
  }, [products, allDistributeurs, counts, activeDistributeurs, view, conversionRateByDistributeur]);

  return (
    <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Product {view === 'volume' ? 'interest' : 'performance'} by {groupLabel}
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setView('volume')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 ${view === 'volume' ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400'}`}
            >
              Volume
            </button>
            <button
              type="button"
              onClick={() => setView('conversion')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 ${view === 'conversion' ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400'}`}
            >
              Conversion rate
            </button>
          </div>
          <p className="text-xs text-slate-500">Click a column to zoom into its {groupLabel} breakdown</p>
        </div>
      </div>
      <div className="mt-4 h-96">
        <Bar
          data={productData}
          options={{
            ...stackedBarOptions,
            plugins: {
              ...stackedBarOptions.plugins,
              legend: {
                ...stackedBarOptions.plugins?.legend,
                // En mode conversion, les datasets sont "par rang" (cf. useMemo ci-dessus), donc pas de
                // correspondance 1:1 dataset<->distributeur à toggler au clic — la légende redevient
                // purement informative (couleurs + noms) et n'agit plus sur la visibilité des segments.
                onClick: view === 'conversion' ? () => {} : undefined,
                labels: {
                  ...stackedBarOptions.plugins?.legend?.labels,
                  ...(view === 'conversion'
                    ? {
                        generateLabels: () =>
                          legendDistributeurs.map((distributeur, index) => ({
                            text: distributeur,
                            fillStyle: colorForDistributeur(distributeur),
                            strokeStyle: colorForDistributeur(distributeur),
                            datasetIndex: index,
                          })),
                      }
                    : {}),
                },
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const name = view === 'conversion' ? (distributeurAtPoint?.[context.datasetIndex]?.[context.dataIndex] ?? null) : context.dataset.label;
                    return name ? `${name}: ${formatValue(context.parsed.y ?? 0)}` : '';
                  },
                },
                filter: (item) => (view === 'conversion' ? Boolean(distributeurAtPoint?.[item.datasetIndex]?.[item.dataIndex]) : true),
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- option custom au plugin maison, non typé par chart.js
              ...({ stackedTotalLabels: { enabled: view === 'volume' } } as any),
            },
            onClick: makeCategoryClickHandler(
              products,
              allDistributeurs,
              counts,
              view === 'volume' ? 'Product interest' : 'Product conversion rate',
              activeDistributeurs,
              onDrilldown,
              formatValue,
            ),
          }}
          plugins={[stackedTotalLabelPlugin()]}
        />
      </div>
    </section>
  );
}
