import type { Distributeur } from 'shared/types/distributeur';

export interface AssignmentResult {
  distributeurNom: string;
  estNouveauDistributeur: boolean;
  distributeur: Distributeur;
}

function findCountryValue(valeurs: Record<string, string>): string | null {
  const key = Object.keys(valeurs).find((k) => k.trim().toLowerCase() === 'country');
  const value = key ? valeurs[key].trim() : '';
  return value.length > 0 ? value : null;
}

// Règle actuelle : un distributeur par pays. Amenée à changer (cf. CLAUDE.md § Pièges spécifiques
// à lead_tracker) — isolée ici plutôt qu'inline dans le usecase pour rester remplaçable sans
// toucher à l'orchestration. Retourne `null` si le lead n'a pas de pays renseigné (non assignable).
export function assignerDistributeur(valeurs: Record<string, string>, distributeursExistants: Record<string, Distributeur>): AssignmentResult | null {
  const pays = findCountryValue(valeurs);
  if (!pays) {
    return null;
  }

  const existant = Object.values(distributeursExistants).find((distributeur) => distributeur.zone.trim().toLowerCase() === pays.toLowerCase());
  if (existant) {
    return { distributeurNom: existant.nom, estNouveauDistributeur: false, distributeur: existant };
  }

  const nouveau: Distributeur = { nom: pays, mail: '', zone: pays };
  return { distributeurNom: nouveau.nom, estNouveauDistributeur: true, distributeur: nouveau };
}
