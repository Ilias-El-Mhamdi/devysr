import type { PushJobEtat, PushRun, PushRunResume, UpscanRun } from 'shared/types/run';
import {
  buildColumnRules,
  editableHeadersFrom,
  hashExcludedHeadersFrom,
  requiredApiNamesFrom,
  type LeadFieldMetaLike,
  type ReportDescribeLike,
} from '../domain/lead/columnRules';

const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Firefox and sign back in to Salesforce to refresh the push status.';

export class PushRunNotFoundError extends Error {
  constructor() {
    super('Push run not found.');
  }
}

interface BulkJobStatusLike {
  state: PushJobEtat;
  numberRecordsProcessed: number | null;
  numberRecordsFailed: number | null;
}

export interface RefreshPushStatusDeps {
  getRun: (runId: string) => Promise<PushRun | null>;
  getUpscanRun: (runId: string) => Promise<UpscanRun | null>;
  readRunOutputFile: (runId: string, fichier: string) => Promise<string>;
  patchRunResume: (runId: string, resume: PushRunResume) => Promise<PushRun>;
  getSalesforceSessionCookie: () => Promise<string | null>;
  toBearerToken: (cookie: string) => string;
  fetchReportDescribe: (bearerToken: string) => Promise<ReportDescribeLike>;
  fetchLeadFieldsMeta: (bearerToken: string) => Promise<LeadFieldMetaLike[]>;
  getJobStatus: (bearerToken: string, jobId: string) => Promise<BulkJobStatusLike>;
  applyUpscanDiffToLeads: (csv: string, editableHeaders: ReadonlySet<string>, hashExcludedHeaders: ReadonlySet<string>) => Promise<number>;
}

// Un `JobComplete` avec des enregistrements en échec mélange des lignes acceptées et refusées par
// Salesforce, qu'on ne sait pas distinguer sans un appel Bulk API supplémentaire (failedResults) —
// non fait pour l'instant, donc on n'applique rien à leads.json dans ce cas (cf. pushToSalesforce.uc.ts).
function isFullySuccessful(status: BulkJobStatusLike): boolean {
  return status.state === 'JobComplete' && (status.numberRecordsFailed ?? 0) === 0;
}

// Le job Bulk API continue de traiter les enregistrements de façon asynchrone côté Salesforce
// après qu'on l'a soumis (statut "InProgress") — ce usecase relit juste son état actuel et met à
// jour le résumé du run, sans en créer un nouveau ni repousser les données. Si ce refresh est le
// premier à observer un job intégralement terminé (0 échec), il applique aussi les valeurs
// éditables confirmées à leads.json — pushToSalesforce.uc.ts fait de même quand le job est déjà
// terminé au moment du push, donc `leadsAppliques` sert de garde pour ne jamais appliquer deux fois.
export function createRefreshPushStatusUseCase(deps: RefreshPushStatusDeps) {
  return async function refreshPushStatus(pushRunId: string): Promise<PushRunResume> {
    const run = await deps.getRun(pushRunId);
    if (!run || !run.resume) {
      throw new PushRunNotFoundError();
    }

    const cookie = await deps.getSalesforceSessionCookie();
    if (!cookie) {
      throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
    }
    const bearerToken = deps.toBearerToken(cookie);

    const status = await deps.getJobStatus(bearerToken, run.resume.jobId);

    let leadsAppliques = run.resume.leadsAppliques;
    if (!leadsAppliques && isFullySuccessful(status)) {
      const upscanRun = await deps.getUpscanRun(run.input.upscanRunId);
      if (upscanRun?.output.fichier) {
        const [describe, leadFields] = await Promise.all([deps.fetchReportDescribe(bearerToken), deps.fetchLeadFieldsMeta(bearerToken)]);
        const columnRules = buildColumnRules(describe, requiredApiNamesFrom(leadFields));
        const csv = await deps.readRunOutputFile(run.input.upscanRunId, upscanRun.output.fichier);
        await deps.applyUpscanDiffToLeads(csv, editableHeadersFrom(columnRules), hashExcludedHeadersFrom(columnRules));
        leadsAppliques = true;
      }
    }

    const resume: PushRunResume = {
      jobId: run.resume.jobId,
      etatSalesforce: status.state,
      nbEnregistresTraites: status.numberRecordsProcessed,
      nbEnregistresEnEchec: status.numberRecordsFailed,
      leadsAppliques,
    };

    const updated = await deps.patchRunResume(pushRunId, resume);
    return updated.resume!;
  };
}
