import type { DownsyncRun, DownsyncRunInput, DownsyncRunOutput, DownsyncRunResume, ExportRun, ImportRun, RunType } from 'shared/types/run';

export class DownsyncAlreadyInProgressError extends Error {
  constructor() {
    super('A downsync is already in progress.');
  }
}

export interface DownsyncFromSalesforceDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  createRun: (type: 'downsync', input: DownsyncRunInput, emptyOutput: DownsyncRunOutput) => Promise<DownsyncRun>;
  patchRunResume: (runId: string, resume: DownsyncRunResume) => Promise<DownsyncRun>;
  completeRun: (runId: string, resume: DownsyncRunResume, output: DownsyncRunOutput) => Promise<DownsyncRun>;
  failRun: (runId: string, erreur: string) => Promise<DownsyncRun>;
  getExportRun: (runId: string) => Promise<ExportRun | null>;
  getImportRun: (runId: string) => Promise<ImportRun | null>;
  exportToSalesforce: (options?: { nouveauxUniquement?: boolean }) => Promise<string>;
  importFromSalesforce: (exportRunId: string) => Promise<string>;
  logActivity: (activite: { nomActivite: string; nbLead?: number; nbDistributeur?: number; date: string }) => Promise<void>;
}

const POLL_INTERVAL_MS = 1000;

// Export et import restent deux runs à part entière (visibles et téléchargeables dans leurs
// propres sections) — downsync ne fait qu'orchestrer leur enchaînement et exposer une progression
// unifiée. Pas de webhook/event Salesforce : on attend la fin de chacun par polling du run.store,
// comme le fait déjà le front pour tout run "en_cours" (cf. CLAUDE.md § actions longues).
async function waitForExportRun(getExportRun: DownsyncFromSalesforceDeps['getExportRun'], runId: string): Promise<ExportRun> {
  for (;;) {
    const run = await getExportRun(runId);
    if (!run) throw new Error(`Export run not found: ${runId}`);
    if (run.statut !== 'en_cours') return run;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function waitForImportRun(getImportRun: DownsyncFromSalesforceDeps['getImportRun'], runId: string): Promise<ImportRun> {
  for (;;) {
    const run = await getImportRun(runId);
    if (!run) throw new Error(`Import run not found: ${runId}`);
    if (run.statut !== 'en_cours') return run;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export interface DownsyncFromSalesforceOptions {
  nouveauxUniquement?: boolean;
}

// Démarre le run et retourne son id immédiatement ; l'enchaînement export → import se déroule en
// tâche de fond (le front suit `resume.etape` via GET /api/runs, comme les autres runs longs).
export function createDownsyncFromSalesforceUseCase(deps: DownsyncFromSalesforceDeps) {
  return async function downsyncFromSalesforce(options: DownsyncFromSalesforceOptions = {}): Promise<string> {
    if (await deps.hasRunInProgress('downsync')) {
      throw new DownsyncAlreadyInProgressError();
    }

    const nouveauxUniquement = options.nouveauxUniquement ?? false;
    const run = await deps.createRun('downsync', { nouveauxUniquement }, {});

    void (async () => {
      let resume: DownsyncRunResume = {
        etape: 'export',
        exportRunId: null,
        importRunId: null,
        nbLeadExportes: null,
        nbLeadTraites: null,
        nbLeadNouveaux: null,
        nbLeadMisAJour: null,
        nbDistributeurCrees: null,
        nbLeadNonAssignes: null,
      };

      try {
        await deps.patchRunResume(run.id, resume);

        const exportRunId = await deps.exportToSalesforce({ nouveauxUniquement });
        resume = { ...resume, exportRunId };
        await deps.patchRunResume(run.id, resume);

        const exportRun = await waitForExportRun(deps.getExportRun, exportRunId);
        if (exportRun.statut !== 'succes') {
          throw new Error(exportRun.erreur ?? 'Export failed.');
        }

        resume = { ...resume, etape: 'import', nbLeadExportes: exportRun.resume?.nbLead ?? null };
        await deps.patchRunResume(run.id, resume);

        const importRunId = await deps.importFromSalesforce(exportRunId);
        resume = { ...resume, importRunId };
        await deps.patchRunResume(run.id, resume);

        const importRun = await waitForImportRun(deps.getImportRun, importRunId);
        if (importRun.statut !== 'succes') {
          throw new Error(importRun.erreur ?? 'Import failed.');
        }

        resume = {
          ...resume,
          etape: 'termine',
          nbLeadTraites: importRun.resume?.nbLeadTraites ?? null,
          nbLeadNouveaux: importRun.resume?.nbLeadNouveaux ?? null,
          nbLeadMisAJour: importRun.resume?.nbLeadMisAJour ?? null,
          nbDistributeurCrees: importRun.resume?.nbDistributeurCrees ?? null,
          nbLeadNonAssignes: importRun.resume?.nbLeadNonAssignes ?? null,
        };
        await deps.completeRun(run.id, resume, {});
        await deps.logActivity({
          nomActivite: 'downsync',
          nbLead: resume.nbLeadTraites ?? undefined,
          nbDistributeur: resume.nbDistributeurCrees ?? undefined,
          date: new Date().toISOString(),
        });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
