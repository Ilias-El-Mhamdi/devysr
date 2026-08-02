import type { LeadRecord } from 'shared/types/lead';
import type { RunType, UpsyncAnomalie, UpsyncRun, UpsyncRunInput, UpsyncRunOutput, UpsyncRunResume } from 'shared/types/run';
import { buildCsv } from 'shared/formatting/csv';
import { hashLeadValues } from '../domain/lead/lead.hash';
import {
  buildColumnRules,
  editableHeadersFrom,
  requiredApiNamesFrom,
  type LeadFieldMetaLike,
  type ReportDescribeLike,
} from '../domain/lead/columnRules';

const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Firefox and sign back in to Salesforce before retrying the upsync.';
const LEAD_ID_HEADER = 'Lead ID';

export class UpsyncAlreadyInProgressError extends Error {
  constructor() {
    super('An upsync is already in progress.');
  }
}

interface DistributorLeadsSheetLike {
  headers: string[];
  rows: { id: string; valeurs: Record<string, string> }[];
}

export interface UpsyncFromDistributorsDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  createRun: (type: 'upsync', input: UpsyncRunInput, emptyOutput: UpsyncRunOutput) => Promise<UpsyncRun>;
  completeRun: (runId: string, resume: UpsyncRunResume, output: UpsyncRunOutput) => Promise<UpsyncRun>;
  failRun: (runId: string, erreur: string) => Promise<UpsyncRun>;
  writeRunOutputFile: (runId: string, fichier: string, content: string) => Promise<void>;
  getAllLeads: () => Promise<Record<string, LeadRecord>>;
  getSalesforceSessionCookie: () => Promise<string | null>;
  toBearerToken: (cookie: string) => string;
  fetchReportDescribe: (bearerToken: string) => Promise<ReportDescribeLike>;
  fetchLeadFieldsMeta: (bearerToken: string) => Promise<LeadFieldMetaLike[]>;
  listDistributorNames: () => Promise<string[]>;
  readDistributorLeadsSheet: (distributeurNom: string) => Promise<DistributorLeadsSheetLike | null>;
  logActivity: (activite: { nomActivite: string; nbLead?: number; date: string }) => Promise<void>;
}

// Démarre le run et retourne son id immédiatement ; la lecture de potentiellement 50 fichiers Excel
// se termine en tâche de fond (cf. règle CLAUDE.md sur les actions longues).
export function createUpsyncFromDistributorsUseCase(deps: UpsyncFromDistributorsDeps) {
  return async function upsyncFromDistributors(): Promise<string> {
    if (await deps.hasRunInProgress('upsync')) {
      throw new UpsyncAlreadyInProgressError();
    }

    const run = await deps.createRun('upsync', {}, { fichier: null });

    void (async () => {
      try {
        const cookie = await deps.getSalesforceSessionCookie();
        if (!cookie) {
          throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
        }
        const bearerToken = deps.toBearerToken(cookie);
        const [describe, leadFields] = await Promise.all([deps.fetchReportDescribe(bearerToken), deps.fetchLeadFieldsMeta(bearerToken)]);
        const columnRules = buildColumnRules(describe, requiredApiNamesFrom(leadFields));
        const editableHeaders = editableHeadersFrom(columnRules);
        const editableHeaderList = [...editableHeaders];

        const leadsExistants = await deps.getAllLeads();
        const distributeurs = await deps.listDistributorNames();

        const anomalies: UpsyncAnomalie[] = [];
        const modifiedRows: string[][] = [];
        const distributeursImpactes = new Set<string>();

        for (const distributeurNom of distributeurs) {
          const sheet = await deps.readDistributorLeadsSheet(distributeurNom);
          if (!sheet) continue;

          for (const row of sheet.rows) {
            const existant = leadsExistants[row.id];
            if (!existant) {
              anomalies.push({ leadId: row.id, distributeur: distributeurNom, raison: 'Unknown Lead ID (not found in leads.json).' });
              continue;
            }

            const fileEditableHeaders = new Set(sheet.headers.filter((header) => editableHeaders.has(header)));
            const hashCheckValues: Record<string, string> = {};
            for (const header of sheet.headers) {
              hashCheckValues[header] = row.valeurs[header] ?? '';
            }
            const recomputedHash = hashLeadValues(hashCheckValues, fileEditableHeaders);
            if (recomputedHash !== existant.hash) {
              anomalies.push({
                leadId: row.id,
                distributeur: distributeurNom,
                raison: 'A locked (Salesforce-owned) field was changed in Excel — not pushed to Salesforce.',
              });
              continue;
            }

            const hasChange = editableHeaderList.some((header) => (row.valeurs[header] ?? '') !== (existant.valeurs[header] ?? ''));
            if (hasChange) {
              modifiedRows.push([row.id, ...editableHeaderList.map((header) => row.valeurs[header] ?? '')]);
              distributeursImpactes.add(distributeurNom);
            }
          }
        }

        const csv = buildCsv([LEAD_ID_HEADER, ...editableHeaderList], modifiedRows);
        await deps.writeRunOutputFile(run.id, 'upsync.csv', csv);

        const resume: UpsyncRunResume = {
          nbFichiersLus: distributeurs.length,
          nbLeadModifies: modifiedRows.length,
          nbDistributeursImpactes: distributeursImpactes.size,
          anomalies,
        };
        await deps.completeRun(run.id, resume, { fichier: 'upsync.csv' });
        await deps.logActivity({ nomActivite: 'upsync', nbLead: resume.nbLeadModifies, date: new Date().toISOString() });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
