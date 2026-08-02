import { useState } from 'react';
import type { RunStatut } from 'shared/types/run';
import { useExportRuns, useStartExport } from '../../api/export';
import { useImportRuns, useStartImport } from '../../api/import';
import { useVerifyRuns, useStartVerify } from '../../api/verify';
import { useUpsyncRuns, useStartUpsync } from '../../api/upsync';
import { usePushRuns, useStartPush, useRefreshPushStatus } from '../../api/push';
import { useDeleteRun, runDownloadUrl } from '../../api/runs';
import { ConfirmModal } from '../../components/ConfirmModal';
import { toast } from '../../lib/toast';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
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

function RunBadge({ statut, dateDebut }: { statut: RunStatut; dateDebut: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statutBadgeClasses(statut)}`}>{statutLabel(statut)}</span>
      <span className="text-xs text-slate-500">{formatDate(dateDebut)}</span>
    </div>
  );
}

function pushStateBadgeClasses(etatSalesforce: string): string {
  if (etatSalesforce === 'JobComplete') return 'border-neon-green/40 text-neon-green bg-neon-green/10';
  if (etatSalesforce === 'Failed' || etatSalesforce === 'Aborted') return 'border-neon-red/40 text-neon-red bg-neon-red/10';
  return 'border-neon-amber/40 text-neon-amber bg-neon-amber/10 animate-pulse';
}

// Libellés compréhensibles plutôt que les noms d'état bruts de l'API Bulk — "UploadComplete" ne
// veut rien dire pour un directeur (ça sonne comme "terminé" alors que Salesforce n'a pas encore
// traité les enregistrements).
function pushStateLabel(etatSalesforce: string): string {
  switch (etatSalesforce) {
    case 'JobComplete':
      return 'Completed';
    case 'Failed':
      return 'Failed';
    case 'Aborted':
      return 'Aborted';
    default:
      return 'Working…';
  }
}

export function DashboardPage() {
  const { data: exportRuns, isPending: isExportRunsPending } = useExportRuns();
  const startExport = useStartExport();
  const deleteExportRun = useDeleteRun(['export-runs']);

  const { data: importRuns, isPending: isImportRunsPending } = useImportRuns();
  const startImport = useStartImport();
  const deleteImportRun = useDeleteRun(['import-runs']);

  const { data: upsyncRuns, isPending: isUpsyncRunsPending } = useUpsyncRuns();
  const startUpsync = useStartUpsync();
  const deleteUpsyncRun = useDeleteRun(['upsync-runs']);

  const { data: pushRuns, isPending: isPushRunsPending } = usePushRuns();
  const startPush = useStartPush();
  const refreshPushStatus = useRefreshPushStatus();
  const deletePushRun = useDeleteRun(['push-runs']);

  const { data: verifyRuns, isPending: isVerifyRunsPending } = useVerifyRuns();
  const startVerify = useStartVerify();
  const deleteVerifyRun = useDeleteRun(['verify-runs']);

  const [runToDelete, setRunToDelete] = useState<{ id: string; kind: 'export' | 'import' | 'upsync' | 'push' | 'verify' } | null>(null);
  const [nouveauxUniquement, setNouveauxUniquement] = useState(false);

  const hasExportInProgress = exportRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const hasImportInProgress = importRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const hasUpsyncInProgress = upsyncRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const hasPushInProgress = pushRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const hasVerifyInProgress = verifyRuns?.some((run) => run.statut === 'en_cours') ?? false;

  const handleStartExport = () => {
    startExport.mutate(nouveauxUniquement, {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Export failed to start.'),
    });
  };

  const handleStartImport = (exportRunId: string) => {
    startImport.mutate(exportRunId, {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Import failed to start.'),
    });
  };

  const handleStartUpsync = () => {
    startUpsync.mutate(undefined, {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Upsync failed to start.'),
    });
  };

  const handleStartPush = (upsyncRunId: string) => {
    startPush.mutate(upsyncRunId, {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Upload failed to start.'),
    });
  };

  const handleRefreshPushStatus = (pushRunId: string) => {
    refreshPushStatus.mutate(pushRunId, {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to refresh status.'),
    });
  };

  const handleStartVerify = (exportRunId: string) => {
    startVerify.mutate(exportRunId, {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Verify failed to start.'),
    });
  };

  const deleteMutations = {
    export: deleteExportRun,
    import: deleteImportRun,
    upsync: deleteUpsyncRun,
    push: deletePushRun,
    verify: deleteVerifyRun,
  } as const;

  const handleConfirmDelete = () => {
    if (!runToDelete) return;
    deleteMutations[runToDelete.kind].mutate(runToDelete.id, {
      onSuccess: () => setRunToDelete(null),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Deletion failed.'),
    });
  };

  return (
    <main className="min-h-screen px-6 py-12 sm:px-10 lg:px-16">
      <header className="glass-panel glow-cyan rounded-2xl px-8 py-6">
        <p className="font-mono-display text-xs tracking-[0.3em] text-neon-cyan uppercase">lead_tracker</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100">Dashboard</h1>
      </header>

      <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Upsync</h2>
            <p className="mt-1 text-xs text-slate-500">Scans every distributor Excel file and builds a file to push to Salesforce.</p>
          </div>
          <button
            type="button"
            onClick={handleStartUpsync}
            disabled={hasUpsyncInProgress || startUpsync.isPending}
            className="cursor-pointer rounded-md bg-neon-violet/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-neon-violet disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hasUpsyncInProgress ? 'Upsync in progress…' : 'Run upsync'}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {isUpsyncRunsPending && <p className="text-sm text-slate-500">Loading upsyncs…</p>}
          {!isUpsyncRunsPending && upsyncRuns?.length === 0 && <p className="text-sm text-slate-500">No upsyncs yet.</p>}

          {upsyncRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                  {run.resume && (
                    <>
                      <p className="mt-1 text-sm text-slate-300">
                        {run.resume.nbFichiersLus} file(s) scanned · {run.resume.nbLeadModifies} lead(s) modified ·{' '}
                        {run.resume.nbDistributeursImpactes} distributor(s) impacted
                        {run.resume.anomalies.length > 0 && ` · ${run.resume.anomalies.length} anomalie(s)`}
                      </p>
                      {run.resume.anomalies.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-neon-amber">
                          {run.resume.anomalies.map((anomalie, index) => (
                            <li key={`${anomalie.leadId}-${index}`}>
                              {anomalie.distributeur} · {anomalie.leadId} — {anomalie.raison}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {run.erreur && <p className="mt-1 text-sm text-neon-red">{run.erreur}</p>}
                </div>

                <div className="flex shrink-0 gap-2">
                  {run.statut === 'succes' && (run.resume?.nbLeadModifies ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => handleStartPush(run.id)}
                      disabled={hasPushInProgress || startPush.isPending}
                      className="cursor-pointer rounded-md border border-neon-green/40 px-3 py-1.5 text-xs font-medium text-neon-green hover:bg-neon-green/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Upload
                    </button>
                  )}
                  {run.statut === 'succes' && run.output.fichier && (
                    <a
                      href={runDownloadUrl(run.id)}
                      className="rounded-md border border-neon-cyan/40 px-3 py-1.5 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/10"
                    >
                      Download
                    </a>
                  )}
                  {run.statut !== 'en_cours' && (
                    <button
                      type="button"
                      onClick={() => setRunToDelete({ id: run.id, kind: 'upsync' })}
                      className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-neon-red hover:text-neon-red"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
        <h2 className="text-lg font-semibold text-slate-100">Upload</h2>
        <p className="mt-1 text-xs text-slate-500">Pushes an upsync file to Salesforce via Bulk API — updates leads by Lead ID.</p>

        <div className="mt-6 flex flex-col gap-3">
          {isPushRunsPending && <p className="text-sm text-slate-500">Loading uploads…</p>}
          {!isPushRunsPending && pushRuns?.length === 0 && <p className="text-sm text-slate-500">No uploads yet.</p>}

          {pushRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                  {run.resume && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${pushStateBadgeClasses(run.resume.etatSalesforce)}`}>
                        {pushStateLabel(run.resume.etatSalesforce)}
                      </span>
                      {run.resume.nbEnregistresTraites !== null && (
                        <span className="text-xs text-slate-500">
                          {run.resume.nbEnregistresTraites} processed
                          {!!run.resume.nbEnregistresEnEchec && `, ${run.resume.nbEnregistresEnEchec} failed`}
                        </span>
                      )}
                    </div>
                  )}
                  {run.erreur && <p className="mt-1 text-sm text-neon-red">{run.erreur}</p>}
                </div>

                <div className="flex shrink-0 gap-2">
                  {run.statut === 'succes' && run.resume?.etatSalesforce !== 'JobComplete' && (
                    <button
                      type="button"
                      onClick={() => handleRefreshPushStatus(run.id)}
                      disabled={refreshPushStatus.isPending}
                      className="cursor-pointer rounded-md border border-neon-cyan/40 px-3 py-1.5 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Refresh status
                    </button>
                  )}
                  {run.statut !== 'en_cours' && (
                    <button
                      type="button"
                      onClick={() => setRunToDelete({ id: run.id, kind: 'push' })}
                      className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs whitespace-nowrap text-slate-400 hover:border-neon-red hover:text-neon-red"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">Exports</h2>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleStartExport}
              disabled={hasExportInProgress || startExport.isPending}
              className="cursor-pointer rounded-md bg-neon-violet/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-neon-violet disabled:cursor-not-allowed disabled:opacity-40"
            >
              {hasExportInProgress ? 'Export in progress…' : 'Start export'}
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={nouveauxUniquement}
                onChange={(event) => setNouveauxUniquement(event.target.checked)}
                className="cursor-pointer accent-neon-violet"
              />
              New lead only
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {isExportRunsPending && <p className="text-sm text-slate-500">Loading exports…</p>}
          {!isExportRunsPending && exportRuns?.length === 0 && <p className="text-sm text-slate-500">No exports yet.</p>}

          {exportRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                    {run.input.nouveauxUniquement && (
                      <span className="rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-0.5 text-xs whitespace-nowrap text-neon-cyan">new only</span>
                    )}
                  </div>
                  {run.resume && (
                    <p className="mt-1 text-sm text-slate-300">
                      {run.resume.nbLead} leads exported · {formatSize(run.resume.tailleFichierOctets)}
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
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => handleStartImport(run.id)}
                        disabled={hasImportInProgress || startImport.isPending}
                        className="cursor-pointer rounded-md border border-neon-green/40 px-3 py-1.5 text-xs font-medium text-neon-green hover:bg-neon-green/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Import
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartVerify(run.id)}
                        disabled={hasVerifyInProgress || startVerify.isPending}
                        className="cursor-pointer rounded-md border border-neon-amber/40 px-3 py-1.5 text-xs font-medium text-neon-amber hover:bg-neon-amber/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Verify
                      </button>
                    </>
                  )}
                  {run.statut !== 'en_cours' && (
                    <button
                      type="button"
                      onClick={() => setRunToDelete({ id: run.id, kind: 'export' })}
                      className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-neon-red hover:text-neon-red"
                    >
                      Delete
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
          {isImportRunsPending && <p className="text-sm text-slate-500">Loading imports…</p>}
          {!isImportRunsPending && importRuns?.length === 0 && <p className="text-sm text-slate-500">No imports yet.</p>}

          {importRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                  {run.resume && (
                    <p className="mt-1 text-sm text-slate-300">
                      {run.resume.nbLeadTraites} leads processed · {run.resume.nbLeadNouveaux} new · {run.resume.nbLeadMisAJour} updated ·{' '}
                      {run.resume.nbDistributeurCrees} distributor(s) created
                      {run.resume.nbLeadNonAssignes > 0 && ` · ${run.resume.nbLeadNonAssignes} unassigned`}
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
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
        <h2 className="text-lg font-semibold text-slate-100">Verifications</h2>
        <p className="mt-1 text-xs text-slate-500">
          Checks that leads.json is up to date with a given export, on the fields editable by distributors.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {isVerifyRunsPending && <p className="text-sm text-slate-500">Loading verifications…</p>}
          {!isVerifyRunsPending && verifyRuns?.length === 0 && <p className="text-sm text-slate-500">No verifications yet.</p>}

          {verifyRuns?.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <RunBadge statut={run.statut} dateDebut={run.dateDebut} />
                  {run.resume && (
                    <p className="mt-1 text-sm text-slate-300">
                      {run.resume.nbLeadEcart} lead(s) out of sync · {run.resume.nbDistributeursImpactes} distributor(s) impacted
                    </p>
                  )}
                  {run.erreur && <p className="mt-1 text-sm text-neon-red">{run.erreur}</p>}
                </div>

                <div className="flex shrink-0 gap-2">
                  {run.statut === 'succes' && run.output.fichier && (
                    <a
                      href={runDownloadUrl(run.id)}
                      className="rounded-md border border-neon-cyan/40 px-3 py-1.5 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/10"
                    >
                      Download
                    </a>
                  )}
                  {run.statut !== 'en_cours' && (
                    <button
                      type="button"
                      onClick={() => setRunToDelete({ id: run.id, kind: 'verify' })}
                      className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs whitespace-nowrap text-slate-400 hover:border-neon-red hover:text-neon-red"
                    >
                      Delete
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
          title={`Delete this ${runToDelete.kind}?`}
          description="The file and its history will be permanently deleted."
          confirmLabel="Delete"
          isConfirming={deleteMutations[runToDelete.kind].isPending}
          onConfirm={handleConfirmDelete}
          onCancel={() => setRunToDelete(null)}
        />
      )}
    </main>
  );
}
