import type { PushJobEtat, PushRun, PushRunResume } from 'shared/types/run';

const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Chrome and sign back in to Salesforce to refresh the push status.';

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
  patchRunResume: (runId: string, resume: PushRunResume) => Promise<PushRun>;
  getSalesforceSessionCookie: () => Promise<string | null>;
  toBearerToken: (cookie: string) => string;
  getJobStatus: (bearerToken: string, jobId: string) => Promise<BulkJobStatusLike>;
}

// Le job Bulk API continue de traiter les enregistrements de façon asynchrone côté Salesforce
// après qu'on l'a soumis (statut "InProgress") — ce usecase relit juste son état actuel et met à
// jour le résumé du run, sans en créer un nouveau ni repousser les données.
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
    const resume: PushRunResume = {
      jobId: run.resume.jobId,
      etatSalesforce: status.state,
      nbEnregistresTraites: status.numberRecordsProcessed,
      nbEnregistresEnEchec: status.numberRecordsFailed,
    };

    const updated = await deps.patchRunResume(pushRunId, resume);
    return updated.resume!;
  };
}
