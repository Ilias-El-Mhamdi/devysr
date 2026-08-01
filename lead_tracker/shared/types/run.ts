export type RunType = 'export' | 'import';

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

export type AnyRun = ExportRun | ImportRun;
