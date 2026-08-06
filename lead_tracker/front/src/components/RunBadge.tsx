import type { RunStatut } from 'shared/types/run';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
}

function statutBadgeClasses(statut: RunStatut): string {
  switch (statut) {
    case 'succes':
      return 'border-neon-green/40 text-neon-green bg-neon-green/10';
    case 'echec':
      return 'border-neon-red/40 text-neon-red bg-neon-red/10';
    case 'en_cours':
      return 'border-neon-amber/40 text-neon-amber bg-neon-amber/10 animate-pulse';
  }
}

function statutLabel(statut: RunStatut): string {
  switch (statut) {
    case 'succes':
      return 'Success';
    case 'echec':
      return 'Failed';
    case 'en_cours':
      return 'In progress';
  }
}

export function RunBadge({ statut, dateDebut }: { statut: RunStatut; dateDebut: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statutBadgeClasses(statut)}`}>{statutLabel(statut)}</span>
      <span className="text-xs text-slate-500">{formatDate(dateDebut)}</span>
    </div>
  );
}
