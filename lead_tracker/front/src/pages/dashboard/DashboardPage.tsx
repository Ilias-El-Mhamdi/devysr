import { useState } from 'react';
import type { Run } from 'shared/types/run';
import { useHello } from '../../api/hello';
import { useDeleteExportRun, useExportRuns, useStartExport, exportDownloadUrl } from '../../api/export';
import { ConfirmModal } from '../../components/ConfirmModal';
import { toast } from '../../lib/toast';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  return `${(bytes / 1024).toFixed(1)} Ko`;
}

function statutBadgeClasses(statut: Run['statut']): string {
  switch (statut) {
    case 'succes':
      return 'border-neon-green/40 text-neon-green bg-neon-green/10';
    case 'echec':
      return 'border-neon-red/40 text-neon-red bg-neon-red/10';
    case 'en_cours':
      return 'border-neon-amber/40 text-neon-amber bg-neon-amber/10 animate-pulse';
  }
}

function statutLabel(statut: Run['statut']): string {
  switch (statut) {
    case 'succes':
      return 'Succès';
    case 'echec':
      return 'Échec';
    case 'en_cours':
      return 'En cours';
  }
}

export function DashboardPage() {
  const { data, isPending, isError } = useHello();
  const { data: runs, isPending: isRunsPending } = useExportRuns();
  const startExport = useStartExport();
  const deleteRun = useDeleteExportRun();
  const [runToDelete, setRunToDelete] = useState<string | null>(null);

  const hasRunInProgress = runs?.some((run) => run.statut === 'en_cours') ?? false;

  const handleStartExport = () => {
    startExport.mutate(undefined, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Lancement de l'export échoué."),
    });
  };

  const handleConfirmDelete = () => {
    if (!runToDelete) return;
    deleteRun.mutate(runToDelete, {
      onSuccess: () => setRunToDelete(null),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Suppression échouée.'),
    });
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="glass-panel glow-cyan rounded-2xl px-8 py-6">
        <p className="font-mono-display text-xs tracking-[0.3em] text-neon-cyan uppercase">lead_tracker</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100">Dashboard</h1>
        {isPending && <p className="mt-2 text-sm text-slate-500">Connexion au back…</p>}
        {isError && <p className="mt-2 text-sm text-neon-red">Le back ne répond pas.</p>}
        {data && <p className="mt-2 text-sm text-slate-400">{data.message}</p>}
      </header>

      <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Exports</h2>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={hasRunInProgress || startExport.isPending}
            className="cursor-pointer rounded-md bg-neon-violet/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-neon-violet disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hasRunInProgress ? 'Export en cours…' : 'Lancer un export'}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {isRunsPending && <p className="text-sm text-slate-500">Chargement des exports…</p>}
          {!isRunsPending && runs?.length === 0 && <p className="text-sm text-slate-500">Aucun export pour l’instant.</p>}

          {runs?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statutBadgeClasses(run.statut)}`}>{statutLabel(run.statut)}</span>
                    <span className="text-xs text-slate-500">{formatDate(run.dateDebut)}</span>
                  </div>
                  {run.resume && (
                    <p className="mt-1 text-sm text-slate-300">
                      {run.resume.nbLead} leads exportés · {formatSize(run.resume.tailleFichierOctets)}
                    </p>
                  )}
                  {run.erreur && <p className="mt-1 text-sm text-neon-red">{run.erreur}</p>}
                </div>

                <div className="flex shrink-0 gap-2">
                  {run.statut === 'succes' && run.output.fichier && (
                    <a
                      href={exportDownloadUrl(run.id)}
                      className="rounded-md border border-neon-cyan/40 px-3 py-1.5 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/10"
                    >
                      Télécharger
                    </a>
                  )}
                  {run.statut !== 'en_cours' && (
                    <button
                      type="button"
                      onClick={() => setRunToDelete(run.id)}
                      className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-neon-red hover:text-neon-red"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {runToDelete && (
        <ConfirmModal
          title="Supprimer cet export ?"
          description="Le fichier et son historique seront définitivement supprimés."
          confirmLabel="Supprimer"
          isConfirming={deleteRun.isPending}
          onConfirm={handleConfirmDelete}
          onCancel={() => setRunToDelete(null)}
        />
      )}
    </main>
  );
}
