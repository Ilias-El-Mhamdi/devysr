import type { PushJobEtat, PushRun, PushRunInput, PushRunOutput, PushRunResume, RunType, UpscanRun } from 'shared/types/run';
import { parseSalesforceCsv, csvRowsToLeadValues } from 'shared/parsing/salesforceCsv';
import { buildCsv } from 'shared/formatting/csv';
import {
  buildColumnRules,
  editableApiNamesByHeader,
  editableHeadersFrom,
  requiredApiNamesFrom,
  type LeadFieldMetaLike,
  type ReportDescribeLike,
} from '../domain/lead/columnRules';

const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Firefox and sign back in to Salesforce before pushing to Salesforce.';
const LEAD_ID_HEADER = 'Lead ID';
const SALESFORCE_ID_HEADER = 'Id';
// Salesforce affiche les cellules vides comme "-" dans un report — cette valeur est donc reprise
// telle quelle dans le CSV d'export puis dans l'Excel distributeur. Ce n'est pas une vraie valeur,
// juste un vide affiché : la renvoyer telle quelle à l'API Bulk écrirait le texte littéral "-" dans
// un champ texte (corruption silencieuse) ou ferait échouer tout le job sur un champ numérique
// (ex. AnnualRevenue → INVALID_FIELD, cf. features/upscan.md). On la traite comme une chaîne vide.
const BLANK_REPORT_PLACEHOLDER = '-';

export class PushAlreadyInProgressError extends Error {
  constructor() {
    super('A push is already in progress.');
  }
}

export class UpscanRunNotReadyError extends Error {
  constructor() {
    super('This upscan run cannot be used (not found, still in progress, failed, or has no modified leads).');
  }
}

interface BulkJobStatusLike {
  state: PushJobEtat;
  numberRecordsProcessed: number | null;
  numberRecordsFailed: number | null;
  errorMessage: string | null;
}

export interface PushToSalesforceDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  getUpscanRun: (runId: string) => Promise<UpscanRun | null>;
  readRunOutputFile: (runId: string, fichier: string) => Promise<string>;
  createRun: (type: 'push', input: PushRunInput, emptyOutput: PushRunOutput) => Promise<PushRun>;
  completeRun: (runId: string, resume: PushRunResume, output: PushRunOutput) => Promise<PushRun>;
  failRun: (runId: string, erreur: string) => Promise<PushRun>;
  getSalesforceSessionCookie: () => Promise<string | null>;
  toBearerToken: (cookie: string) => string;
  fetchReportDescribe: (bearerToken: string) => Promise<ReportDescribeLike>;
  fetchLeadFieldsMeta: (bearerToken: string) => Promise<LeadFieldMetaLike[]>;
  createIngestJob: (bearerToken: string) => Promise<string>;
  uploadJobData: (bearerToken: string, jobId: string, csv: string) => Promise<void>;
  closeJob: (bearerToken: string, jobId: string) => Promise<void>;
  getJobStatus: (bearerToken: string, jobId: string) => Promise<BulkJobStatusLike>;
  applyUpscanDiffToLeads: (csv: string, editableHeaders: ReadonlySet<string>) => Promise<number>;
  logActivity: (activite: { nomActivite: string; nbLead?: number; date: string }) => Promise<void>;
}

// Reconstruit un CSV compatible Bulk API à partir du CSV lisible (labels de report, "Lead ID")
// produit par upscanFromDistributors.uc.ts : Bulk API attend des noms de champs API ("Status", pas
// "Lead Status") et la colonne d'identité doit s'appeler "Id" (pas "Lead ID"). Toute colonne sans
// mapping connu (champ composé exclu, cf. editableApiNamesByHeader) est retirée plutôt que
// d'envoyer un en-tête invalide (un label de report n'est jamais un nom de champ Salesforce).
function buildBulkCsv(csv: string, apiNamesByHeader: Record<string, string>): string {
  const { headers, rows } = parseSalesforceCsv(csv);
  const leadIdIndex = headers.findIndex((header) => header.trim().toLowerCase() === LEAD_ID_HEADER.toLowerCase());
  if (leadIdIndex === -1) {
    throw new Error(`The "${LEAD_ID_HEADER}" column is missing from the upscan file.`);
  }

  const pushableHeaders = headers.filter((header, index) => index !== leadIdIndex && apiNamesByHeader[header]);
  const bulkHeaders = [SALESFORCE_ID_HEADER, ...pushableHeaders.map((header) => apiNamesByHeader[header])];

  const leadValues = csvRowsToLeadValues(headers, rows);
  const bulkRows = leadValues.map((valeurs) => [
    valeurs[headers[leadIdIndex]],
    ...pushableHeaders.map((header) => {
      const value = valeurs[header] ?? '';
      return value.trim() === BLANK_REPORT_PLACEHOLDER ? '' : value;
    }),
  ]);

  return buildCsv(bulkHeaders, bulkRows);
}

function toResume(jobId: string, status: BulkJobStatusLike, leadsAppliques: boolean): PushRunResume {
  return {
    jobId,
    etatSalesforce: status.state,
    nbEnregistresTraites: status.numberRecordsProcessed,
    nbEnregistresEnEchec: status.numberRecordsFailed,
    leadsAppliques,
  };
}

// Le job Bulk API est "OK pour l'upload" seulement s'il est intégralement terminé sans échec : un
// `JobComplete` avec des enregistrements en échec mélange des lignes acceptées et refusées par
// Salesforce, qu'on ne sait pas distinguer sans un appel Bulk API supplémentaire (failedResults) —
// non fait pour l'instant, donc on n'applique rien à leads.json dans ce cas plutôt que de risquer
// d'y écrire une valeur que Salesforce a refusée.
function isFullySuccessful(status: BulkJobStatusLike): boolean {
  return status.state === 'JobComplete' && (status.numberRecordsFailed ?? 0) === 0;
}

// Pousse le fichier upscan vers Salesforce via Bulk API 2.0 plutôt qu'un dépôt manuel dans le Data
// Import Wizard — même mécanisme sid-comme-bearer-token que le reste, pas de Connected App OAuth,
// et pas de limite basse en nombre de lignes (contrairement à l'API Analytics utilisée pour
// l'export) — cf. features/upscan.md. Run à part entière (comme import référence un export via
// exportRunId), pas un simple champ greffé sur le run upscan.
export function createPushToSalesforceUseCase(deps: PushToSalesforceDeps) {
  return async function pushToSalesforce(upscanRunId: string): Promise<string> {
    if (await deps.hasRunInProgress('push')) {
      throw new PushAlreadyInProgressError();
    }

    const upscanRun = await deps.getUpscanRun(upscanRunId);
    if (!upscanRun || upscanRun.statut !== 'succes' || !upscanRun.output.fichier || !upscanRun.resume || upscanRun.resume.nbLeadModifies === 0) {
      throw new UpscanRunNotReadyError();
    }

    const run = await deps.createRun('push', { upscanRunId }, {});

    void (async () => {
      try {
        const cookie = await deps.getSalesforceSessionCookie();
        if (!cookie) {
          throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
        }
        const bearerToken = deps.toBearerToken(cookie);

        const [describe, leadFields] = await Promise.all([deps.fetchReportDescribe(bearerToken), deps.fetchLeadFieldsMeta(bearerToken)]);
        const columnRules = buildColumnRules(describe, requiredApiNamesFrom(leadFields));
        const apiNamesByHeader = editableApiNamesByHeader(columnRules);
        const editableHeaders = editableHeadersFrom(columnRules);

        const csv = await deps.readRunOutputFile(upscanRunId, upscanRun.output.fichier!);
        const bulkCsv = buildBulkCsv(csv, apiNamesByHeader);

        const jobId = await deps.createIngestJob(bearerToken);
        await deps.uploadJobData(bearerToken, jobId, bulkCsv);
        await deps.closeJob(bearerToken, jobId);
        const status = await deps.getJobStatus(bearerToken, jobId);

        let leadsAppliques = false;
        if (isFullySuccessful(status)) {
          await deps.applyUpscanDiffToLeads(csv, editableHeaders);
          leadsAppliques = true;
        }

        await deps.completeRun(run.id, toResume(jobId, status, leadsAppliques), {});
        await deps.logActivity({ nomActivite: 'push', nbLead: status.numberRecordsProcessed ?? undefined, date: new Date().toISOString() });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
