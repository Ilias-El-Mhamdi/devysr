import fs from 'node:fs/promises';
import { getSalesforceSessionCookie } from './puppeteerSession';
import { toBearerToken } from './sidToken';
import { fetchReportDescribe } from './reportDescribe';
import { fetchAllReportRows } from './reportRun';
import { buildCsv } from './csv';

export const SALESFORCE_SESSION_EXPIRED_ERROR = 'Salesforce session expired. Open Chrome and sign back in to Salesforce before retrying the export.';
const LEAD_ID_HEADER = 'Lead ID';

// Exécute le vrai report Salesforce (via reportRun.ts) plutôt que l'export CSV legacy (bloqué sur
// les orgs Lightning-only) ou une retraduction SOQL (fragile sur les colonnes cross-objet) — cf.
// features/exportLeads.md. `excludeLeadIds`, s'il est fourni, retire du CSV les leads déjà connus
// (déjà importés) — utilisé par l'option "nouveaux uniquement" au lancement de l'export.
export async function runExportJob(
  outputPath: string,
  excludeLeadIds?: ReadonlySet<string>,
): Promise<{ nbLead: number; tailleFichierOctets: number }> {
  const sidCookie = await getSalesforceSessionCookie();
  if (!sidCookie) {
    throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
  }
  const bearerToken = toBearerToken(sidCookie);

  const describe = await fetchReportDescribe(bearerToken);
  const { headers, rows } = await fetchAllReportRows(bearerToken, describe);

  let filteredRows = rows;
  if (excludeLeadIds && excludeLeadIds.size > 0) {
    const leadIdIndex = headers.findIndex((header) => header.trim().toLowerCase() === LEAD_ID_HEADER.toLowerCase());
    if (leadIdIndex === -1) {
      throw new Error(`The "${LEAD_ID_HEADER}" column must be present in the Salesforce report to filter new leads.`);
    }
    filteredRows = rows.filter((row) => !excludeLeadIds.has(row[leadIdIndex]));
  }

  const csv = buildCsv(headers, filteredRows);

  await fs.writeFile(outputPath, csv, 'utf-8');
  const { size } = await fs.stat(outputPath);

  return { nbLead: filteredRows.length, tailleFichierOctets: size };
}
