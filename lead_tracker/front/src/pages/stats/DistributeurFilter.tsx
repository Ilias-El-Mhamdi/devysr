import { colorForDistributeur } from './distributeurColors';

export interface FilterGroup {
  name: string;
  members: string[];
}

interface DistributeurFilterProps {
  groups: FilterGroup[];
  allDistributeurs: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function DistributeurFilter({ groups, allDistributeurs, selected, onChange }: DistributeurFilterProps) {
  const toggleGroup = (members: string[]) => {
    const allActive = members.every((member) => selected.has(member));
    const next = new Set(selected);
    members.forEach((member) => (allActive ? next.delete(member) : next.add(member)));
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(new Set(allDistributeurs))}
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
      {groups.map(({ name, members }) => {
        // Groupe (zone) actif seulement si TOUS ses distributeurs sont sélectionnés — cohérent avec
        // le clic, qui active/désactive le groupe entier d'un coup plutôt que de gérer un état
        // "partiellement sélectionné".
        const isActive = members.length > 0 && members.every((member) => selected.has(member));
        return (
          <button
            key={name}
            type="button"
            onClick={() => toggleGroup(members)}
            title={members.length > 1 ? members.join(', ') : undefined}
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
