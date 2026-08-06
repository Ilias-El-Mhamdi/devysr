import type { LeadRecord } from 'shared/types/lead';
import type { ExportRun, RunType, VerifyRun, VerifyRunInput, VerifyRunOutput, VerifyRunResume } from 'shared/types/run';
import { parseSalesforceCsv, csvRowsToLeadValues } from 'shared/parsing/salesforceCsv';
import { buildCsv } from 'shared/formatting/csv';
import {
  buildColumnRules,
  editableHeadersFrom,
  requiredApiNamesFrom,
  type LeadFieldMetaLike,
  type ReportDescribeLike,
} from '../domain/lead/columnRules';

const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Firefox and sign back in to Salesforce before retrying the verify.';
const LEAD_ID_HEADER = 'Lead ID';

export class VerifyAlreadyInProgressError extends Error {
  constructor() {
    super('A verify is already in progress.');
  }
}

export class ExportRunNotReadyError extends Error {
  constructor() {
    super('This export run cannot be used (not found, still in progress, or failed).');
  }
}

export interface VerifyDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  getExportRun: (runId: string) => Promise<ExportRun | null>;
  readRunOutputFile: (runId: string, fichier: string) => Promise<string>;
  createRun: (type: 'verify', input: VerifyRunInput, emptyOutput: VerifyRunOutput) => Promise<VerifyRun>;
  completeRun: (runId: string, resume: VerifyRunResume, output: VerifyRunOutput) => Promise<VerifyRun>;
  failRun: (runId: string, erreur: string) => Promise<VerifyRun>;
  writeRunOutputFile: (runId: string, fichier: string, content: string) => Promise<void>;
  getAllLeads: () => Promise<Record<string, LeadRecord>>;
  getSalesforceSessionCookie: () => Promise<string | null>;
  toBearerToken: (cookie: string) => string;
  fetchReportDescribe: (bearerToken: string) => Promise<ReportDescribeLike>;
  fetchLeadFieldsMeta: (bearerToken: string) => Promise<LeadFieldMetaLike[]>;
  logActivity: (activite: { nomActivite: string; nbLead?: number; date: string }) => Promise<void>;
}

// Vérifie que leads.json est à jour avec un export Salesforce donné, sur les colonnes éditables
// par le distributeur uniquement (mêmes règles que l'upscan/l'import, `columnRules.ts`) — pas les
// colonnes en lecture seule, dont la fraîcheur est déjà garantie par le prochain import complet.
// Un écart signale soit un push qui n'a pas (encore) été appliqué à leads.json, soit une
// modification faite directement dans Salesforce en dehors du cycle upscan → push.
// Lecture seule vis-à-vis de leads.json (comme l'upscan) : ce usecase ne corrige rien lui-même,
// il ne fait que rapporter les écarts.
export function createVerifyUseCase(deps: VerifyDeps) {
  return async function verify(exportRunId: string): Promise<string> {
    if (await deps.hasRunInProgress('verify')) {
      throw new VerifyAlreadyInProgressError();
    }

    const exportRun = await deps.getExportRun(exportRunId);
    if (!exportRun || exportRun.statut !== 'succes' || !exportRun.output.fichier) {
      throw new ExportRunNotReadyError();
    }

    const run = await deps.createRun('verify', { exportRunId }, { fichier: null });

    void (async () => {
      try {
        const csv = await deps.readRunOutputFile(exportRunId, exportRun.output.fichier!);
        const { headers, rows } = parseSalesforceCsv(csv);

        const leadIdHeader = headers.find((header) => header.trim().toLowerCase() === LEAD_ID_HEADER.toLowerCase());
        if (!leadIdHeader) {
          throw new Error(`The "${LEAD_ID_HEADER}" column must be present in the Salesforce report to verify leads.`);
        }

        const cookie = await deps.getSalesforceSessionCookie();
        if (!cookie) {
          throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
        }
        const bearerToken = deps.toBearerToken(cookie);
        const [describe, leadFields] = await Promise.all([deps.fetchReportDescribe(bearerToken), deps.fetchLeadFieldsMeta(bearerToken)]);
        const columnRules = buildColumnRules(describe, requiredApiNamesFrom(leadFields));
        const editableHeaders = editableHeadersFrom(columnRules);
        const editableHeaderList = [...editableHeaders].filter((header) => headers.includes(header));

        const leadsExistants = await deps.getAllLeads();

        const ecartRows: string[][] = [];
        const distributeursImpactes = new Set<string>();

        for (const valeurs of csvRowsToLeadValues(headers, rows)) {
          const id = valeurs[leadIdHeader];
          const existant = id ? leadsExistants[id] : undefined;
          if (!id || !existant) continue;

          const hasEcart = editableHeaderList.some((header) => (valeurs[header] ?? '') !== (existant.valeurs[header] ?? ''));
          if (hasEcart) {
            ecartRows.push([id, ...editableHeaderList.map((header) => valeurs[header] ?? '')]);
            distributeursImpactes.add(existant.distributeur);
          }
        }

        const outputCsv = buildCsv([LEAD_ID_HEADER, ...editableHeaderList], ecartRows);
        await deps.writeRunOutputFile(run.id, 'verify.csv', outputCsv);

        const resume: VerifyRunResume = {
          exportRunId,
          nbLeadEcart: ecartRows.length,
          nbDistributeursImpactes: distributeursImpactes.size,
        };
        await deps.completeRun(run.id, resume, { fichier: 'verify.csv' });
        await deps.logActivity({ nomActivite: 'verify', nbLead: resume.nbLeadEcart, date: new Date().toISOString() });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
