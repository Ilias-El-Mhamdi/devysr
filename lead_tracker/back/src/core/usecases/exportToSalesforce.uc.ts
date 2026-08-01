import type { LeadRecord } from 'shared/types/lead';
import type { ExportRun, ExportRunInput, ExportRunOutput, ExportRunResume, RunType } from 'shared/types/run';

export class ExportAlreadyInProgressError extends Error {
  constructor() {
    super('An export is already in progress.');
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
  getAllLeads: () => Promise<Record<string, LeadRecord>>;
  runExportJob: (outputPath: string, excludeLeadIds?: ReadonlySet<string>) => Promise<{ nbLead: number; tailleFichierOctets: number }>;
  logActivity: (activity: { nomActivite: string; nbLead?: number; date: string }) => Promise<void>;
}

export interface ExportToSalesforceOptions {
  nouveauxUniquement?: boolean;
}

// Démarre le run et retourne son id immédiatement ; l'export lui-même se termine en tâche de fond
// (le front suit sa progression via GET /api/runs) pour ne jamais bloquer la requête HTTP le temps
// que Puppeteer/Salesforce répondent — cf. règle CLAUDE.md sur les actions longues.
export function createExportToSalesforceUseCase(deps: ExportToSalesforceDeps) {
  return async function exportToSalesforce(options: ExportToSalesforceOptions = {}): Promise<string> {
    if (await deps.hasRunInProgress('export')) {
      throw new ExportAlreadyInProgressError();
    }

    const nouveauxUniquement = options.nouveauxUniquement ?? false;
    const run = await deps.createRun('export', { reportId: deps.reportId, reportUrl: deps.reportUrl, nouveauxUniquement }, { fichier: null });

    void (async () => {
      try {
        const outputPath = deps.outputFilePath(run.id, 'export.csv');
        const excludeLeadIds = nouveauxUniquement ? new Set(Object.keys(await deps.getAllLeads())) : undefined;
        const { nbLead, tailleFichierOctets } = await deps.runExportJob(outputPath, excludeLeadIds);
        await deps.completeRun(run.id, { nbLead, tailleFichierOctets }, { fichier: 'export.csv' });
        await deps.logActivity({ nomActivite: 'export', nbLead, date: new Date().toISOString() });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
