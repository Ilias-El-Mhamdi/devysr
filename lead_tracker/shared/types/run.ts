export type RunType = 'export' | 'import' | 'upscan' | 'push' | 'verify' | 'downsync';

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

export type UpscanRunInput = Record<string, never>;

export interface UpscanRunOutput {
  fichier: string | null;
}

export interface UpscanAnomalie {
  leadId: string;
  distributeur: string;
  raison: string;
}

export interface UpscanRunResume {
  nbFichiersLus: number;
  nbLeadModifies: number;
  nbDistributeursImpactes: number;
  anomalies: UpscanAnomalie[];
}

export type UpscanRun = Run<UpscanRunInput, UpscanRunOutput, UpscanRunResume>;

export interface PushRunInput {
  upscanRunId: string;
}

export type PushRunOutput = Record<string, never>;

export type PushJobEtat = 'Open' | 'UploadComplete' | 'InProgress' | 'JobComplete' | 'Failed' | 'Aborted';

export interface PushRunResume {
  jobId: string;
  etatSalesforce: PushJobEtat;
  nbEnregistresTraites: number | null;
  nbEnregistresEnEchec: number | null;
  // true une fois que les valeurs éditables confirmées par Salesforce (JobComplete, 0 échec) ont
  // été appliquées à leads.json — cf. applyUpscanDiffToLeads.uc.ts.
  leadsAppliques: boolean;
}

export type PushRun = Run<PushRunInput, PushRunOutput, PushRunResume>;

export interface VerifyRunInput {
  exportRunId: string;
}

export interface VerifyRunOutput {
  fichier: string | null;
}

export interface VerifyRunResume {
  // Run d'export utilisé comme référence pour la comparaison (cf. VerifyRunInput.exportRunId) —
  // dupliqué ici pour que le rapport du run reste lisible sans devoir aller relire son input.
  exportRunId: string;
  nbLeadEcart: number;
  nbDistributeursImpactes: number;
}

export type VerifyRun = Run<VerifyRunInput, VerifyRunOutput, VerifyRunResume>;

export interface DownsyncRunInput {
  nouveauxUniquement: boolean;
}

export type DownsyncRunOutput = Record<string, never>;

// Étape en cours pendant le traitement (le run downsync orchestre un export puis un import, chacun
// son propre run) — affichée en direct côté front pour donner un retour visuel pendant l'action
// longue, cf. features/downsync.md.
export type DownsyncEtape = 'export' | 'import' | 'termine';

export interface DownsyncRunResume {
  etape: DownsyncEtape;
  exportRunId: string | null;
  importRunId: string | null;
  nbLeadExportes: number | null;
  nbLeadTraites: number | null;
  nbLeadNouveaux: number | null;
  nbLeadMisAJour: number | null;
  nbDistributeurCrees: number | null;
  nbLeadNonAssignes: number | null;
}

export type DownsyncRun = Run<DownsyncRunInput, DownsyncRunOutput, DownsyncRunResume>;

export type AnyRun = ExportRun | ImportRun | UpscanRun | PushRun | VerifyRun | DownsyncRun;
