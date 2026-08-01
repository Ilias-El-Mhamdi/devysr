import { createHash } from 'node:crypto';

// Caractère de contrôle improbable dans une valeur Salesforce, pour séparer les champs sans
// ambiguïté de concaténation (ex. {A:"1",B:""} vs {A:"1B"}).
const FIELD_SEPARATOR = String.fromCharCode(1);

// Calcul pur (aucune I/O) : le hash sert à détecter si un distributeur a modifié une valeur venant
// de Salesforce dans son Excel. Il couvre TOUTES les colonnes du report — aucune n'est encore
// "libre" pour le distributeur (pas de colonne de commentaire/statut dédiée pour l'instant, cf.
// features/importDistributeurs.md). Le jour où une colonne devient éditable par le distributeur,
// elle devra être explicitement exclue ici.
export function hashLeadValues(valeurs: Record<string, string>): string {
  const serialized = Object.keys(valeurs)
    .sort()
    .map((key) => `${key}=${valeurs[key]}`)
    .join(FIELD_SEPARATOR);
  return createHash('sha256').update(serialized).digest('hex');
}
