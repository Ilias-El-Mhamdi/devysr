import fs from 'node:fs/promises';
import { config } from '../../config';
import { getSalesforceSessionCookie } from './puppeteerSession';

export const SALESFORCE_SESSION_EXPIRED_ERROR = "Session Salesforce expirée. Ouvre Chrome et reconnecte-toi à Salesforce avant de relancer l'export.";

function buildExportUrl(): string {
  return `https://${config.salesforce.instanceHost}/${config.salesforce.reportId}?export=1&enc=UTF-8&xf=csv`;
}

function countCsvDataRows(csv: string): number {
  const lines = csv.split(/\r\n|\n/).filter((line) => line.length > 0);
  return Math.max(lines.length - 1, 0); // -1 pour la ligne d'en-tête
}

// GET direct avec le cookie de session plutôt que de piloter le clic "Export" dans l'UI Lightning
// (Shadow DOM des LWC, dialogues de format, fragilité aux refontes UI) — cf. features/exportLeads.md.
export async function runExportJob(outputPath: string): Promise<{ nbLead: number; tailleFichierOctets: number }> {
  const cookie = await getSalesforceSessionCookie();
  if (!cookie) {
    throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
  }

  const response = await fetch(buildExportUrl(), { headers: { Cookie: cookie } });
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  // xf=csv redirigé en HTML = page de login Salesforce, donc cookie expiré.
  if (!response.ok || contentType.includes('text/html')) {
    throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
  }

  await fs.writeFile(outputPath, body, 'utf-8');
  const { size } = await fs.stat(outputPath);

  return { nbLead: countCsvDataRows(body), tailleFichierOctets: size };
}
