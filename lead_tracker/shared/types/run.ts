export type RunType = 'export';

export type RunStatut = 'en_cours' | 'succes' | 'echec';

export interface RunResume {
  nbLead: number;
  tailleFichierOctets: number;
}

export interface ExportRunInput {
  reportId: string;
  reportUrl: string;
}

export interface ExportRunOutput {
  fichier: string | null;
}

export interface Run {
  id: string;
  type: RunType;
  statut: RunStatut;
  dateDebut: string;
  dateFin: string | null;
  resume: RunResume | null;
  input: ExportRunInput;
  output: ExportRunOutput;
  erreur: string | null;
}
