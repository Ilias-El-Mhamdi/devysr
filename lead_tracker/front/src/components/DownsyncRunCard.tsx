import type { DownsyncEtape, DownsyncRun } from 'shared/types/run';
import { RunBadge } from './RunBadge';

function downsyncEtapeLabel(etape: DownsyncEtape): string {
  switch (etape) {
    case 'export':
      return 'Exporting from Salesforce…';
    case 'import':
      return 'Importing in Excel…';
    case 'termine':
      return 'Done';
  }
}

interface DownsyncRunCardProps {
  run: DownsyncRun;
  onDelete?: () => void;
}

export function DownsyncRunCard({ run, onDelete }: DownsyncRunCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-6 py-5">
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-100">DownSync</p>
          <div className="flex items-center gap-2">
            <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
            {run.input.nouveauxUniquement && (
              <span className="rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-0.5 text-xs whitespace-nowrap text-neon-cyan">new only</span>
            )}
          </div>
          {run.statut === 'en_cours' && run.resume && (
            <p className="text-sm text-neon-amber">{downsyncEtapeLabel(run.resume.etape)}</p>
          )}
          {run.statut === 'succes' && run.resume && (
            <p className="text-sm text-slate-300">
              {run.resume.nbLeadExportes} leads exported · {run.resume.nbLeadTraites} processed · {run.resume.nbLeadNouveaux} new ·{' '}
              {run.resume.nbLeadMisAJour} updated · {run.resume.nbDistributeurCrees} distributor(s) created
              {!!run.resume.nbLeadNonAssignes && ` · ${run.resume.nbLeadNonAssignes} unassigned`}
            </p>
          )}
          {run.erreur && <p className="text-sm text-neon-red">{run.erreur}</p>}
        </div>

        {run.statut !== 'en_cours' && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs whitespace-nowrap text-slate-400 hover:border-neon-red hover:text-neon-red"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
