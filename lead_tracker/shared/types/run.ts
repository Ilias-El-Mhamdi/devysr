export type RunType = 'export' | 'import' | 'upsync' | 'push';

export type RunStatut = 'en_cours' | 'succes' | 'echec';

export interface Run<TInput = unknown, TOutput = unknown, TResume = unknown> {
  id: string;
  type: RunType;
  statut: RunStatut;
  dateDebut: string;
  dateFin: string | null;
  resume: TResume | null;
  input: TInput;
  output: TOutput;
  erreur: string | null;
}

export interface ExportRunInput {
  reportId: string;
  reportUrl: string;
  nouveauxUniquement: boolean;
}

export interface ExportRunOutput {
  fichier: string | null;
}

export interface ExportRunResume {
  nbLead: number;
  tailleFichierOctets: number;
}

export type ExportRun = Run<ExportRunInput, ExportRunOutput, ExportRunResume>;

export interface ImportRunInput {
  exportRunId: string;
}

export interface ImportRunOutput {
  fichier: null;
}

export interface ImportRunResume {
  nbLeadTraites: number;
  nbLeadNouveaux: number;
  nbLeadMisAJour: number;
  nbDistributeurCrees: number;
  nbLeadNonAssignes: number;
}

export type ImportRun = Run<ImportRunInput, ImportRunOutput, ImportRunResume>;

export type UpsyncRunInput = Record<string, never>;

export interface UpsyncRunOutput {
  fichier: string | null;
}

export interface UpsyncAnomalie {
  leadId: string;
  distributeur: string;
  raison: string;
}

export interface UpsyncRunResume {
  nbFichiersLus: number;
  nbLeadModifies: number;
  nbDistributeursImpactes: number;
  anomalies: UpsyncAnomalie[];
}

export type UpsyncRun = Run<UpsyncRunInput, UpsyncRunOutput, UpsyncRunResume>;

export interface PushRunInput {
  upsyncRunId: string;
}

export type PushRunOutput = Record<string, never>;

export type PushJobEtat = 'Open' | 'UploadComplete' | 'InProgress' | 'JobComplete' | 'Failed' | 'Aborted';

export interface PushRunResume {
  jobId: string;
  etatSalesforce: PushJobEtat;
  nbEnregistresTraites: number | null;
  nbEnregistresEnEchec: number | null;
  // true une fois que les valeurs éditables confirmées par Salesforce (JobComplete, 0 échec) ont
  // été appliquées à leads.json — cf. applyUpsyncDiffToLeads.uc.ts.
  leadsAppliques: boolean;
}

export type PushRun = Run<PushRunInput, PushRunOutput, PushRunResume>;

export type AnyRun = ExportRun | ImportRun | UpsyncRun | PushRun;
