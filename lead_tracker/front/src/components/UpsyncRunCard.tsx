import type { UpsyncRun } from 'shared/types/run';
import { RunBadge } from './RunBadge';

interface UpsyncRunCardProps {
  run: UpsyncRun;
  onDelete?: () => void;
}

export function UpsyncRunCard({ run, onDelete }: UpsyncRunCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-6 py-5">
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-100">UpSync</p>
          <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
          {run.resume?.etape === 'upscan' && <p className="text-sm text-neon-amber">Scanning…</p>}
          {run.resume && run.resume.nbFichiersLus !== null && (
            <p className="text-sm text-slate-300">
              {run.resume.nbFichiersLus} file(s) scanned · {run.resume.nbLeadModifies} lead(s) modified ·{' '}
              {run.resume.nbDistributeursImpactes} distributor(s) impacted
              {!!run.resume.anomalies.length && ` · ${run.resume.anomalies.length} anomalie(s)`}
            </p>
          )}
          {run.resume?.etape === 'push' && <p className="text-sm text-neon-amber">Uploading…</p>}
          {run.resume?.etape === 'termine' && run.resume.nbEnregistresTraites !== null && (
            <p className="text-sm text-slate-300">
              {run.resume.nbEnregistresTraites} updated
              {!!run.resume.nbEnregistresEnEchec && ` · ${run.resume.nbEnregistresEnEchec} failed`}
            </p>
          )}
          {!!run.resume?.anomalies.length && (
            <ul className="space-y-0.5 text-xs text-neon-amber">
              {run.resume.anomalies.map((anomalie, index) => (
                <li key={`${anomalie.leadId}-${index}`}>
                  {anomalie.distributeur} · {anomalie.leadId} — {anomalie.raison}
                </li>
              ))}
            </ul>
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
