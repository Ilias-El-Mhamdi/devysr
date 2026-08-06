import type { LeadRecord } from 'shared/types/lead';
import type { RunType, UpscanAnomalie, UpscanRun, UpscanRunInput, UpscanRunOutput, UpscanRunResume } from 'shared/types/run';
import { buildCsv } from 'shared/formatting/csv';
import { hashLeadValues } from '../domain/lead/lead.hash';
import {
  buildColumnRules,
  editableHeadersFrom,
  hashExcludedHeadersFrom,
  requiredApiNamesFrom,
  type LeadFieldMetaLike,
  type ReportDescribeLike,
} from '../domain/lead/columnRules';

const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Firefox and sign back in to Salesforce before retrying the upscan.';
const LEAD_ID_HEADER = 'Lead ID';

export class UpscanAlreadyInProgressError extends Error {
  constructor() {
    super('An upscan is already in progress.');
  }
}

interface DistributorLeadsSheetLike {
  headers: string[];
  rows: { id: string; valeurs: Record<string, string> }[];
}

export interface UpscanFromDistributorsDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  createRun: (type: 'upscan', input: UpscanRunInput, emptyOutput: UpscanRunOutput) => Promise<UpscanRun>;
  completeRun: (runId: string, resume: UpscanRunResume, output: UpscanRunOutput) => Promise<UpscanRun>;
  failRun: (runId: string, erreur: string) => Promise<UpscanRun>;
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
export function createUpscanFromDistributorsUseCase(deps: UpscanFromDistributorsDeps) {
  return async function upscanFromDistributors(): Promise<string> {
    if (await deps.hasRunInProgress('upscan')) {
      throw new UpscanAlreadyInProgressError();
    }

    const run = await deps.createRun('upscan', {}, { fichier: null });

    void (async () => {
      try {
        const cookie = await deps.getSalesforceSessionCookie();
        if (!cookie) {
          throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
        }
        const bearerToken = deps.toBearerToken(cookie);
        const [describe, leadFields] = await Promise.all([deps.fetchReportDescribe(bearerToken), deps.fetchLeadFieldsMeta(bearerToken)]);
        const columnRules = buildColumnRules(describe, requiredApiNamesFrom(leadFields));
        const editableHeaderList = [...editableHeadersFrom(columnRules)];
        const hashExcludedHeaders = hashExcludedHeadersFrom(columnRules);

        const leadsExistants = await deps.getAllLeads();
        const distributeurs = await deps.listDistributorNames();

        const anomalies: UpscanAnomalie[] = [];
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

            const fileHashExcludedHeaders = new Set(sheet.headers.filter((header) => hashExcludedHeaders.has(header)));
            const hashCheckValues: Record<string, string> = {};
            for (const header of sheet.headers) {
              hashCheckValues[header] = row.valeurs[header] ?? '';
            }
            const recomputedHash = hashLeadValues(hashCheckValues, fileHashExcludedHeaders);
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
        await deps.writeRunOutputFile(run.id, 'upscan.csv', csv);

        const resume: UpscanRunResume = {
          nbFichiersLus: distributeurs.length,
          nbLeadModifies: modifiedRows.length,
          nbDistributeursImpactes: distributeursImpactes.size,
          anomalies,
        };
        await deps.completeRun(run.id, resume, { fichier: 'upscan.csv' });
        await deps.logActivity({ nomActivite: 'upscan', nbLead: resume.nbLeadModifies, date: new Date().toISOString() });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
