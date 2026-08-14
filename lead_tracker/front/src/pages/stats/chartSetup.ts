import { ArcElement, BarElement, CategoryScale, Chart, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import type { Plugin } from 'chart.js';

Chart.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip);

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.15)';
Chart.defaults.font.family = "'JetBrains Mono', 'Fira Code', ui-monospace, monospace";

// Passé en `plugins` prop d'un <Bar> précis (pas Chart.register) — un seul graphe en a besoin pour
// l'instant, pas la peine de l'imposer partout. `horizontal` place l'étiquette à droite de la
// barre plutôt qu'au-dessus, pour les graphes en `indexAxis: 'y'` (ex. le drilldown par catégorie).
export function valueLabelPlugin(formatValue: (value: number) => string = (value) => String(value), horizontal = false): Plugin<'bar'> {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        meta.data.forEach((element, index) => {
          const raw = dataset.data[index];
          if (typeof raw !== 'number') return;
          const { x, y } = element as unknown as { x: number; y: number };
          ctx.save();
          ctx.fillStyle = '#e2e8f0';
          ctx.font = "600 11px 'JetBrains Mono', monospace";
          if (horizontal) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatValue(raw), x + 6, y);
          } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(formatValue(raw), x, y - 4);
          }
          ctx.restore();
        });
      });
    },
  };
}

// Pour un graphe empilé : une seule étiquette par colonne (le total de la pile), pas une par
// segment — sinon illisible dès qu'il y a plus de 2-3 distributeurs empilés.
//
// L'activation passe par `chart.options.plugins.stackedTotalLabels.enabled` (lu à chaque
// `afterDatasetsDraw`, donc réactif à `options`) plutôt que par la prop `plugins` du composant
// <Bar> : react-chartjs-2 ne recrée pas la liste de plugins d'une instance déjà montée à chaque
// re-render, donc un graphe qui bascule volume/taux de conversion sur le même canvas continuait
// à afficher l'ancien total si on essayait de retirer le plugin en changeant cette prop.
export function stackedTotalLabelPlugin(formatValue: (value: number) => string = (value) => String(value)): Plugin<'bar'> {
  return {
    id: 'stackedTotalLabels',
    afterDatasetsDraw(chart) {
      const options = (chart.options.plugins as { stackedTotalLabels?: { enabled?: boolean } } | undefined)?.stackedTotalLabels;
      if (options?.enabled === false) return;
      const { ctx } = chart;
      const labelCount = chart.data.labels?.length ?? 0;
      for (let index = 0; index < labelCount; index += 1) {
        let total = 0;
        let topY = Infinity;
        let x: number | null = null;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;
          const raw = dataset.data[index];
          if (typeof raw !== 'number' || raw <= 0) return;
          total += raw;
          const element = meta.data[index] as unknown as { x: number; y: number } | undefined;
          if (element && element.y < topY) {
            topY = element.y;
            x = element.x;
          }
        });
        if (x === null || total === 0) continue;
        ctx.save();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = "600 11px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(formatValue(total), x, topY - 4);
        ctx.restore();
      }
    },
  };
}
