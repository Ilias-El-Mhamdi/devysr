// Les colonnes d'un lead viennent du report Salesforce configuré par le directeur (dynamique,
// pas un schéma fixe) — cf. features/importDistributeurs.md. `valeurs` garde tout tel quel,
// indexé par le libellé de colonne du report (ex. "Company / Account").
export interface LeadRecord {
  id: string; // Lead ID Salesforce — le report doit toujours inclure une colonne "Lead ID".
  valeurs: Record<string, string>;
  distributeur: string; // '' si non assignable (pas de pays renseigné)
  hash: string;
  dateImport: string;
  dateDerniereModification: string;
}

export interface ChampChange {
  champ: string;
  avant: string | null;
  apres: string;
}

export interface HistoriqueEntry extends ChampChange {
  leadId: string;
  date: string;
}
