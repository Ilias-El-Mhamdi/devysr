import { useMemo } from 'react';
import type { FilterGroup } from './DistributeurFilter';
import { DistributeurFilter } from './DistributeurFilter';

export type GroupBy = 'distributeur' | 'region';

interface DistributeurFilterSectionProps {
  distributeurs: string[];
  regions: string[];
  regionMembers: Record<string, string[]>;
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function DistributeurFilterSection({
  distributeurs,
  regions,
  regionMembers,
  groupBy,
  onGroupByChange,
  selected,
  onChange,
}: DistributeurFilterSectionProps) {
  const groups: FilterGroup[] = useMemo(
    () =>
      groupBy === 'distributeur'
        ? distributeurs.map((name) => ({ name, members: [name] }))
        : regions.map((name) => ({ name, members: regionMembers[name] ?? [] })),
    [groupBy, distributeurs, regions, regionMembers],
  );

  return (
    <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-100">Distributeur filter</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => onGroupByChange('distributeur')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 ${groupBy === 'distributeur' ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400'}`}
            >
              By distributeur
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange('region')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 ${groupBy === 'region' ? 'border-neon-cyan text-neon-cyan' : 'border-slate-700 text-slate-400'}`}
            >
              By region
            </button>
          </div>
          <p className="text-xs text-slate-500">Conditions every KPI, chart and table below</p>
        </div>
      </div>
      <div className="mt-4">
        <DistributeurFilter groups={groups} allDistributeurs={distributeurs} selected={selected} onChange={onChange} />
      </div>
    </section>
  );
}
