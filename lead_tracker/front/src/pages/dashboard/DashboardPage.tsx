import { useState } from 'react';
import type { RunStatut } from 'shared/types/run';
import { useHello } from '../../api/hello';
import { useExportRuns, useStartExport } from '../../api/export';
import { useImportRuns, useStartImport } from '../../api/import';
import { useDeleteRun, runDownloadUrl } from '../../api/runs';
import { ConfirmModal } from '../../components/ConfirmModal';
import { toast } from '../../lib/toast';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  return `${(bytes / 1024).toFixed(1)} Ko`;
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
      return 'Succès';
    case 'echec':
      return 'Échec';
    case 'en_cours':
      return 'En cours';
  }
}

function RunBadge({ statut, dateDebut }: { statut: RunStatut; dateDebut: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statutBadgeClasses(statut)}`}>{statutLabel(statut)}</span>
      <span className="text-xs text-slate-500">{formatDate(dateDebut)}</span>
    </div>
  );
}

export function DashboardPage() {
  const { data, isPending, isError } = useHello();

  const { data: exportRuns, isPending: isExportRunsPending } = useExportRuns();
  const startExport = useStartExport();
  const deleteExportRun = useDeleteRun(['export-runs']);

  const { data: importRuns, isPending: isImportRunsPending } = useImportRuns();
  const startImport = useStartImport();
  const deleteImportRun = useDeleteRun(['import-runs']);

  const [runToDelete, setRunToDelete] = useState<{ id: string; kind: 'export' | 'import' } | null>(null);

  const hasExportInProgress = exportRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const hasImportInProgress = importRuns?.some((run) => run.statut === 'en_cours') ?? false;

  const handleStartExport = () => {
    startExport.mutate(undefined, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Lancement de l'export échoué."),
    });
  };

  const handleStartImport = (exportRunId: string) => {
    startImport.mutate(exportRunId, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Lancement de l'import échoué."),
    });
  };

  const handleConfirmDelete = () => {
    if (!runToDelete) return;
    const mutation = runToDelete.kind === 'export' ? deleteExportRun : deleteImportRun;
    mutation.mutate(runToDelete.id, {
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
            disabled={hasExportInProgress || startExport.isPending}
            className="cursor-pointer rounded-md bg-neon-violet/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-neon-violet disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hasExportInProgress ? 'Export en cours…' : 'Lancer un export'}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {isExportRunsPending && <p className="text-sm text-slate-500">Chargement des exports…</p>}
          {!isExportRunsPending && exportRuns?.length === 0 && <p className="text-sm text-slate-500">Aucun export pour l’instant.</p>}

          {exportRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                  {run.resume && (
                    <p className="mt-1 text-sm text-slate-300">
                      {run.resume.nbLead} leads exportés · {formatSize(run.resume.tailleFichierOctets)}
                    </p>
                  )}
                  {run.erreur && <p className="mt-1 text-sm text-neon-red">{run.erreur}</p>}
                </div>

                <div className="flex shrink-0 gap-2">
                  {run.statut === 'succes' && run.output.fichier && (
                    <>
                      <a
                        href={runDownloadUrl(run.id)}
                        className="rounded-md border border-neon-cyan/40 px-3 py-1.5 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/10"
                      >
                        Télécharger
                      </a>
                      <button
                        type="button"
                        onClick={() => handleStartImport(run.id)}
                        disabled={hasImportInProgress || startImport.isPending}
                        className="cursor-pointer rounded-md border border-neon-green/40 px-3 py-1.5 text-xs font-medium text-neon-green hover:bg-neon-green/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Importer
                      </button>
                    </>
                  )}
                  {run.statut !== 'en_cours' && (
                    <button
                      type="button"
                      onClick={() => setRunToDelete({ id: run.id, kind: 'export' })}
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

      <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
        <h2 className="text-lg font-semibold text-slate-100">Imports</h2>

        <div className="mt-6 flex flex-col gap-3">
          {isImportRunsPending && <p className="text-sm text-slate-500">Chargement des imports…</p>}
          {!isImportRunsPending && importRuns?.length === 0 && <p className="text-sm text-slate-500">Aucun import pour l’instant.</p>}

          {importRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                  {run.resume && (
                    <p className="mt-1 text-sm text-slate-300">
                      {run.resume.nbLeadTraites} leads traités · {run.resume.nbLeadNouveaux} nouveaux · {run.resume.nbLeadMisAJour} mis à jour ·{' '}
                      {run.resume.nbDistributeurCrees} distributeur(s) créé(s)
                      {run.resume.nbLeadNonAssignes > 0 && ` · ${run.resume.nbLeadNonAssignes} non assignés`}
                    </p>
                  )}
                  {run.erreur && <p className="mt-1 text-sm text-neon-red">{run.erreur}</p>}
                </div>

                {run.statut !== 'en_cours' && (
                  <button
                    type="button"
                    onClick={() => setRunToDelete({ id: run.id, kind: 'import' })}
                    className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs whitespace-nowrap text-slate-400 hover:border-neon-red hover:text-neon-red"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {runToDelete && (
        <ConfirmModal
          title={`Supprimer cet ${runToDelete.kind === 'export' ? 'export' : 'import'} ?`}
          description="Le fichier et son historique seront définitivement supprimés."
          confirmLabel="Supprimer"
          isConfirming={runToDelete.kind === 'export' ? deleteExportRun.isPending : deleteImportRun.isPending}
          onConfirm={handleConfirmDelete}
          onCancel={() => setRunToDelete(null)}
        />
      )}
    </main>
  );
}
