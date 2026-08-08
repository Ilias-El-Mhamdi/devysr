import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData } from 'chart.js';
import type { ProductsByDistributeur } from 'shared/types/stats';
import { stackedTotalLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import type { Drilldown } from './statsChartUtils';
import { makeCategoryClickHandler, sortCategoriesByTotal, sortDistributeursByImpact, stackedBarOptions } from './statsChartUtils';

interface ProductByDistributeurSectionProps {
  productsByDistributeur: ProductsByDistributeur;
  activeDistributeurs: Set<string>;
  onDrilldown: (drilldown: Drilldown | null) => void;
}

export function ProductByDistributeurSection({ productsByDistributeur, activeDistributeurs, onDrilldown }: ProductByDistributeurSectionProps) {
  const { products, counts } = productsByDistributeur;

  const productData: ChartData<'bar'> = useMemo(() => {
    const distributeurs = sortDistributeursByImpact(
      productsByDistributeur.distributeurs.filter((d) => activeDistributeurs.has(d)),
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
  }, [productsByDistributeur, products, counts, activeDistributeurs]);

  return (
    <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Product interest by distributeur</h2>
        <p className="text-xs text-slate-500">Click a column to zoom into its distributeur breakdown</p>
      </div>
      <div className="mt-4 h-96">
        <Bar
          data={productData}
          options={{
            ...stackedBarOptions,
            onClick: makeCategoryClickHandler(products, productsByDistributeur.distributeurs, counts, 'Product interest', activeDistributeurs, onDrilldown),
          }}
          plugins={[stackedTotalLabelPlugin()]}
        />
      </div>
    </section>
  );
}
