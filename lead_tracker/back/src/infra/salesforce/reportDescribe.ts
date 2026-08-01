import { config } from '../../config';

const API_VERSION = 'v61.0';

export interface ReportFilter {
  column: string;
  operator: string;
  value: string;
}

export interface ReportTypeColumn {
  name: string;
  label: string;
}

export interface ReportDescribe {
  reportMetadata: {
    detailColumns: string[];
    reportFilters: ReportFilter[];
    reportBooleanFilter?: string;
  };
  reportExtendedMetadata: {
    detailColumnInfo: Record<string, { label: string }>;
  };
  // Catalogue de tous les champs disponibles pour ce type de report (pas seulement les colonnes
  // affichées) — labels standards Salesforce, indépendants d'un éventuel renommage des en-têtes de
  // colonnes fait par l'auteur du report. Utilisé pour trouver la clé "Created Date" (chunking).
  reportTypeMetadata: {
    categories: { columns: ReportTypeColumn[] }[];
  };
}

// L'export ne passe plus par le CSV legacy (`?export=1&xf=csv`) : sur un org Lightning-only
// (comme un Developer Edition orgfarm, sans Salesforce Classic), cette URL redirige silencieusement
// vers l'UI (HTTP 200, HTML) au lieu de servir un CSV. On lit donc la définition du report via
// l'API Analytics puis on exécute le vrai report (cf. reportRun.ts) plutôt que de retraduire ses
// colonnes en SOQL — un report peut contenir des colonnes cross-objet (Owner Alias, Created By…)
// et des en-têtes renommés par l'auteur, que Salesforce seul sait résoudre correctement.
export async function fetchReportDescribe(bearerToken: string): Promise<ReportDescribe> {
  const url = `https://${config.salesforce.instanceHost}/services/data/${API_VERSION}/analytics/reports/${config.salesforce.reportId}/describe`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
  if (!response.ok) {
    throw new Error(`Lecture de la définition du report échouée (HTTP ${response.status}).`);
  }
  return (await response.json()) as ReportDescribe;
}
