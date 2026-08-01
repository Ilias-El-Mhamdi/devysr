import fs from 'node:fs/promises';
import { getSalesforceSessionCookie } from './puppeteerSession';
import { toBearerToken } from './sidToken';
import { fetchReportDescribe } from './reportDescribe';
import { fetchAllReportRows } from './reportRun';
import { buildCsv } from './csv';

export const SALESFORCE_SESSION_EXPIRED_ERROR = "Session Salesforce expirée. Ouvre Chrome et reconnecte-toi à Salesforce avant de relancer l'export.";

// Exécute le vrai report Salesforce (via reportRun.ts) plutôt que l'export CSV legacy (bloqué sur
// les orgs Lightning-only) ou une retraduction SOQL (fragile sur les colonnes cross-objet) — cf.
// features/exportLeads.md.
export async function runExportJob(outputPath: string): Promise<{ nbLead: number; tailleFichierOctets: number }> {
  const sidCookie = await getSalesforceSessionCookie();
  if (!sidCookie) {
    throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
  }
  const bearerToken = toBearerToken(sidCookie);

  const describe = await fetchReportDescribe(bearerToken);
  const { headers, rows } = await fetchAllReportRows(bearerToken, describe);
  const csv = buildCsv(headers, rows);

  await fs.writeFile(outputPath, csv, 'utf-8');
  const { size } = await fs.stat(outputPath);

  return { nbLead: rows.length, tailleFichierOctets: size };
}
