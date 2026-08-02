import { config } from '../../config';

const API_VERSION = 'v61.0';

export interface BulkJobStatus {
  id: string;
  state: 'Open' | 'UploadComplete' | 'InProgress' | 'JobComplete' | 'Failed' | 'Aborted';
  numberRecordsProcessed: number | null;
  numberRecordsFailed: number | null;
  errorMessage: string | null;
}

function jobsUrl(path = ''): string {
  return `https://${config.salesforce.instanceHost}/services/data/${API_VERSION}/jobs/ingest${path}`;
}

// Bulk API 2.0 : conçue pour les gros volumes (pas la limite de 2000 lignes de l'API Analytics
// utilisée pour l'export, ni la limite de 200 enregistrements de l'API REST Composite) — la vraie
// limite pratique est la taille du fichier (~150 Mo), largement au-dessus de notre échelle (cf.
// features/upsync.md). Toujours le même sid-comme-bearer-token, pas de Connected App OAuth.
export async function createIngestJob(bearerToken: string): Promise<string> {
  const response = await fetch(jobsUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
    // `shared/formatting/csv.ts` (buildCsv) sépare toujours les lignes par \r\n — il faut le
    // déclarer ici, sinon Salesforce échoue à parser le CSV et le job entier tombe en "Failed"
    // immédiatement (0 enregistrement traité), avant même d'avoir tenté de traiter une ligne.
    body: JSON.stringify({ object: 'Lead', operation: 'update', contentType: 'CSV', lineEnding: 'CRLF' }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create the Bulk API job (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function uploadJobData(bearerToken: string, jobId: string, csv: string): Promise<void> {
  const response = await fetch(jobsUrl(`/${jobId}/batches`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'text/csv' },
    body: csv,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to upload data to the Bulk API job (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
}

export async function closeJob(bearerToken: string, jobId: string): Promise<void> {
  const response = await fetch(jobsUrl(`/${jobId}`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'UploadComplete' }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to close the Bulk API job (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
}

export async function getJobStatus(bearerToken: string, jobId: string): Promise<BulkJobStatus> {
  const response = await fetch(jobsUrl(`/${jobId}`), {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to read the Bulk API job status (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    id: string;
    state: BulkJobStatus['state'];
    numberRecordsProcessed: number | null;
    numberRecordsFailed: number | null;
    errorMessage?: string | null;
  };
  return {
    id: body.id,
    state: body.state,
    numberRecordsProcessed: body.numberRecordsProcessed,
    numberRecordsFailed: body.numberRecordsFailed,
    errorMessage: body.errorMessage ?? null,
  };
}
