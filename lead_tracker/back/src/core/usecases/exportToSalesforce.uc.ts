import type { ExportRun, ExportRunInput, ExportRunOutput, ExportRunResume, RunType } from 'shared/types/run';

export class ExportAlreadyInProgressError extends Error {
  constructor() {
    super('Un export est déjà en cours.');
  }
}

export interface ExportToSalesforceDeps {
  reportId: string;
  reportUrl: string;
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  createRun: (type: 'export', input: ExportRunInput, emptyOutput: ExportRunOutput) => Promise<ExportRun>;
  completeRun: (runId: string, resume: ExportRunResume, output: ExportRunOutput) => Promise<ExportRun>;
  failRun: (runId: string, erreur: string) => Promise<ExportRun>;
  outputFilePath: (runId: string, fichier: string) => string;
  runExportJob: (outputPath: string) => Promise<{ nbLead: number; tailleFichierOctets: number }>;
  logActivity: (activity: { nomActivite: string; nbLead?: number; date: string }) => Promise<void>;
}

// Démarre le run et retourne son id immédiatement ; l'export lui-même se termine en tâche de fond
// (le front suit sa progression via GET /api/runs) pour ne jamais bloquer la requête HTTP le temps
// que Puppeteer/Salesforce répondent — cf. règle CLAUDE.md sur les actions longues.
export function createExportToSalesforceUseCase(deps: ExportToSalesforceDeps) {
  return async function exportToSalesforce(): Promise<string> {
    if (await deps.hasRunInProgress('export')) {
      throw new ExportAlreadyInProgressError();
    }

    const run = await deps.createRun('export', { reportId: deps.reportId, reportUrl: deps.reportUrl }, { fichier: null });

    void (async () => {
      try {
        const outputPath = deps.outputFilePath(run.id, 'export.csv');
        const { nbLead, tailleFichierOctets } = await deps.runExportJob(outputPath);
        await deps.completeRun(run.id, { nbLead, tailleFichierOctets }, { fichier: 'export.csv' });
        await deps.logActivity({ nomActivite: 'export', nbLead, date: new Date().toISOString() });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Erreur inconnue');
      }
    })();

    return run.id;
  };
}
