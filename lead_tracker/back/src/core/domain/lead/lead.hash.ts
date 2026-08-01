import { createHash } from 'node:crypto';

// Caractère de contrôle improbable dans une valeur Salesforce, pour séparer les champs sans
// ambiguïté de concaténation (ex. {A:"1",B:""} vs {A:"1B"}).
const FIELD_SEPARATOR = String.fromCharCode(1);

// Calcul pur (aucune I/O) : le hash sert à détecter si un distributeur a modifié une valeur
// Salesforce dans son Excel *en dehors* des colonnes qu'il a le droit d'éditer (cf.
// features/importDistributeurs.md § Lecture seule vs éditable). `champsExclus` = les colonnes
// éditables par le distributeur (Email, Phone, Description, Lead Status, etc.) : les modifier est
// normal, pas une anomalie à détecter, donc elles ne rentrent jamais dans le hash.
export function hashLeadValues(valeurs: Record<string, string>, champsExclus: ReadonlySet<string> = new Set()): string {
  const serialized = Object.keys(valeurs)
    .filter((key) => !champsExclus.has(key))
    .sort()
    .map((key) => `${key}=${valeurs[key]}`)
    .join(FIELD_SEPARATOR);
  return createHash('sha256').update(serialized).digest('hex');
}
