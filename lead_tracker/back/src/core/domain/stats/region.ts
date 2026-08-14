import type { Distributeur } from 'shared/types/distributeur';

// Regroupement continental des distributeurs, dérivé de `Distributeur.zone` (le pays, cf. shared/types/distributeur.ts)
// — un niveau d'agrégation au-dessus du distributeur, pas un remplacement de `zone`. Toute distributeur
// dont le pays n'est pas encore répertorié ici tombe dans 'Unspecified' plutôt que de planter.
export const REGIONS = ['Europe', 'Asia Pacific', 'Middle East and Africa', 'America', 'latam'] as const;
export type Region = (typeof REGIONS)[number];

const COUNTRY_TO_REGION: Record<string, Region> = {
  Germany: 'Europe',
  'United Kingdom': 'Europe',
  Spain: 'Europe',
  France: 'Europe',
  Italy: 'Europe',
  Netherlands: 'Europe',
  Belgium: 'Europe',
  Switzerland: 'Europe',
  Sweden: 'Europe',
  Poland: 'Europe',
  Ireland: 'Europe',
  Portugal: 'Europe',
  Japan: 'Asia Pacific',
  Australia: 'Asia Pacific',
  China: 'Asia Pacific',
  India: 'Asia Pacific',
  Algeria: 'Middle East and Africa',
  "Cote d'Ivoire": 'Middle East and Africa',
  Morocco: 'Middle East and Africa',
  Senegal: 'Middle East and Africa',
  Tunisia: 'Middle East and Africa',
  'United Arab Emirates': 'Middle East and Africa',
  'United States': 'America',
  Canada: 'America',
  Brazil: 'latam',
  Mexico: 'latam',
};

export function regionForCountry(country: string | undefined): Region | 'Unspecified' {
  if (!country) return 'Unspecified';
  return COUNTRY_TO_REGION[country] ?? 'Unspecified';
}

// nom de distributeur -> région, pour tous les distributeurs connus (indépendamment des leads
// actuellement chargés) — sert à la fois à remapper les leads pour les agrégats régionaux et à
// construire le filtre "par région" côté front (quels distributeurs compose chaque région).
export function computeRegionByDistributeur(distributeurs: Distributeur[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const distributeur of distributeurs) {
    result[distributeur.nom] = regionForCountry(distributeur.zone);
  }
  return result;
}
