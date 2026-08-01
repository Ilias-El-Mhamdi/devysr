import { config } from '../../config';
import type { ReportDescribe } from './reportDescribe';

const API_VERSION = 'v61.0';
const MAX_ROWS_PER_RUN = 2000;
const MAX_RECURSION_DEPTH = 20;

interface RunResponse {
  allData: boolean;
  factMap: Record<string, { rows: { dataCells: { label: string }[] }[] }>;
}

function findCreatedDateColumnKey(describe: ReportDescribe): string {
  for (const category of describe.reportTypeMetadata.categories) {
    const match = category.columns.find((column) => column.label.toLowerCase() === 'created date');
    if (match) {
      return match.name;
    }
  }
  throw new Error('"Created Date" column not found on the report type — cannot paginate beyond 2000 rows.');
}

async function fetchLeadCreatedDateBounds(bearerToken: string): Promise<{ min: string; max: string } | null> {
  const soql = 'SELECT MIN(CreatedDate) mn, MAX(CreatedDate) mx FROM Lead';
  const response = await fetch(`https://${config.salesforce.instanceHost}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to read date bounds (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as { records: { mn: string | null; mx: string | null }[] };
  const record = body.records[0];
  if (!record?.mn || !record.mx) {
    return null;
  }
  return { min: record.mn, max: record.mx };
}

function withDateRangeFilter(
  baseMetadata: ReportDescribe['reportMetadata'],
  columnKey: string,
  startIso: string,
  endIso: string,
): ReportDescribe['reportMetadata'] {
  const filters = [...baseMetadata.reportFilters];
  const baseIndexes = baseMetadata.reportFilters.map((_, index) => index + 1);

  const startIndex = filters.length + 1;
  filters.push({ column: columnKey, operator: 'greaterOrEqual', value: startIso });
  const endIndex = filters.length + 1;
  filters.push({ column: columnKey, operator: 'lessThan', value: endIso });

  const baseLogic = baseMetadata.reportBooleanFilter ?? (baseIndexes.length > 0 ? baseIndexes.join(' AND ') : '');
  const rangeLogic = `${startIndex} AND ${endIndex}`;
  const reportBooleanFilter = baseLogic ? `(${baseLogic}) AND ${rangeLogic}` : rangeLogic;

  return { ...baseMetadata, reportFilters: filters, reportBooleanFilter };
}

// Exécution ad hoc : la définition sauvegardée du report n'est jamais modifiée, seule cette requête
// l'est (cf. doc Salesforce "Execute report with changes without saving").
async function runReport(bearerToken: string, reportMetadata: ReportDescribe['reportMetadata']): Promise<RunResponse> {
  const url = `https://${config.salesforce.instanceHost}/services/data/${API_VERSION}/analytics/reports/${config.salesforce.reportId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportMetadata }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Report execution failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
  return (await response.json()) as RunResponse;
}

function extractRows(run: RunResponse): string[][] {
  const rows = run.factMap['T!T']?.rows;
  if (!rows) {
    throw new Error('Unsupported report format (the report must be tabular, with no grouping).');
  }
  return rows.map((row) => row.dataCells.map((cell) => cell.label));
}

async function runChunk(
  bearerToken: string,
  baseMetadata: ReportDescribe['reportMetadata'],
  createdDateColumnKey: string,
  startIso: string,
  endIso: string,
  depth: number,
  collected: string[][],
): Promise<void> {
  const metadata = withDateRangeFilter(baseMetadata, createdDateColumnKey, startIso, endIso);
  const run = await runReport(bearerToken, metadata);
  const rows = extractRows(run);

  if (run.allData || rows.length < MAX_ROWS_PER_RUN) {
    collected.push(...rows);
    return;
  }

  if (depth >= MAX_RECURSION_DEPTH) {
    throw new Error(
      `Too many leads created within too short an interval to paginate (more than ${MAX_ROWS_PER_RUN} between ${startIso} and ${endIso}).`,
    );
  }

  const midMs = (new Date(startIso).getTime() + new Date(endIso).getTime()) / 2;
  const midIso = new Date(midMs).toISOString();
  if (midIso === startIso || midIso === endIso) {
    throw new Error(`Too many leads created at the same instant to paginate (more than ${MAX_ROWS_PER_RUN} in a non-divisible interval).`);
  }

  await runChunk(bearerToken, baseMetadata, createdDateColumnKey, startIso, midIso, depth + 1, collected);
  await runChunk(bearerToken, baseMetadata, createdDateColumnKey, midIso, endIso, depth + 1, collected);
}

export interface ReportRunResult {
  headers: string[];
  rows: string[][];
}

// Exécute le vrai report Salesforce (Owner Alias, Created By, libellés personnalisés... tout est
// résolu nativement par Salesforce) plutôt que de retraduire sa définition en SOQL. Au-delà de 2000
// lignes (limite du run synchrone), on découpe récursivement par plage de CreatedDate jusqu'à ce que
// chaque chunk tienne dans la limite — cf. features/exportLeads.md.
export async function fetchAllReportRows(bearerToken: string, describe: ReportDescribe): Promise<ReportRunResult> {
  const headers = describe.reportMetadata.detailColumns.map((key) => describe.reportExtendedMetadata.detailColumnInfo[key]?.label ?? key);

  const firstRun = await runReport(bearerToken, describe.reportMetadata);
  const firstRows = extractRows(firstRun);
  if (firstRun.allData || firstRows.length < MAX_ROWS_PER_RUN) {
    return { headers, rows: firstRows };
  }

  const createdDateColumnKey = findCreatedDateColumnKey(describe);
  const bounds = await fetchLeadCreatedDateBounds(bearerToken);
  if (!bounds) {
    return { headers, rows: [] };
  }

  const collected: string[][] = [];
  const endExclusive = new Date(new Date(bounds.max).getTime() + 1000).toISOString();
  await runChunk(bearerToken, describe.reportMetadata, createdDateColumnKey, bounds.min, endExclusive, 0, collected);
  return { headers, rows: collected };
}
