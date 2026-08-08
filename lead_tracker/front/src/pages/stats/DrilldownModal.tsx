import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { valueLabelPlugin } from './chartSetup';
import { colorForDistributeur } from './distributeurColors';
import type { Drilldown } from './statsChartUtils';
import { GRID_COLOR } from './statsChartUtils';

interface DrilldownModalProps {
  drilldown: Drilldown;
  onClose: () => void;
}

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

export function DrilldownModal({ drilldown, onClose }: DrilldownModalProps) {
  const drilldownData: ChartData<'bar'> = useMemo(
    () => ({
      labels: drilldown.entries.map((entry) => entry.distributeur),
      datasets: [
        {
          label: drilldown.title,
          data: drilldown.entries.map((entry) => entry.value),
          backgroundColor: drilldown.entries.map((entry) => colorForDistributeur(entry.distributeur, 0.8)),
          borderRadius: 4,
        },
      ],
    }),
    [drilldown],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6" onClick={onClose}>
      <div className="glass-panel glow-violet w-full max-w-2xl rounded-2xl px-8 py-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">{drilldown.title}</h2>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-neon-cyan">
            Close
          </button>
        </div>
        <div className="mt-4 max-h-[70vh] overflow-y-auto" style={{ height: `${Math.max(drilldown.entries.length * 32, 120)}px` }}>
          <Bar data={drilldownData} options={drilldownOptions} plugins={[valueLabelPlugin((value) => String(value), true)]} />
        </div>
      </div>
    </div>
  );
}
