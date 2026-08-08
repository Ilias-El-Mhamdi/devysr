import { DistributeurFilter } from './DistributeurFilter';

interface DistributeurFilterSectionProps {
  distributeurs: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function DistributeurFilterSection({ distributeurs, selected, onChange }: DistributeurFilterSectionProps) {
  return (
    <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Distributeur filter</h2>
        <p className="text-xs text-slate-500">Conditions every KPI, chart and table below</p>
      </div>
      <div className="mt-4">
        <DistributeurFilter distributeurs={distributeurs} selected={selected} onChange={onChange} />
      </div>
    </section>
  );
}
