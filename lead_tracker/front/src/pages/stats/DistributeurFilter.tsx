import { colorForDistributeur } from './distributeurColors';

interface DistributeurFilterProps {
  distributeurs: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function DistributeurFilter({ distributeurs, selected, onChange }: DistributeurFilterProps) {
  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(new Set(distributeurs))}
        className="cursor-pointer rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-neon-cyan"
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onChange(new Set())}
        className="cursor-pointer rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-neon-cyan"
      >
        None
      </button>
      {distributeurs.map((name) => {
        const isActive = selected.has(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => toggle(name)}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition"
            style={{
              borderColor: isActive ? colorForDistributeur(name) : 'rgba(148, 163, 184, 0.25)',
              color: isActive ? colorForDistributeur(name) : '#64748b',
              backgroundColor: isActive ? colorForDistributeur(name, 0.08) : 'transparent',
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForDistributeur(name) }} />
            {name}
          </button>
        );
      })}
    </div>
  );
}
