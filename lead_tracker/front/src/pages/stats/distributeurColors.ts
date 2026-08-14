// Palette fixe pour les 5 régions (cf. back/src/core/domain/stats/region.ts) : seulement 5 valeurs
// à distinguer d'un coup d'œil, contrairement aux ~26 distributeurs — la couleur par hash (angle
// d'or) peut très bien retomber sur deux teintes proches sur un si petit échantillon, donc on les
// choisit à la main, réparties sur tout le cercle chromatique.
const REGION_COLORS: Record<string, string> = {
  Europe: '200, 85%, 60%',
  'Asia Pacific': '45, 90%, 55%',
  'Middle East and Africa': '10, 85%, 58%',
  America: '140, 65%, 48%',
  latam: '280, 75%, 65%',
};

// Couleur déterministe par distributeur (même distributeur = même couleur d'un chargement à
// l'autre) via l'angle d'or, sans dépendre de l'ordre d'itération. Les régions passent par la
// palette fixe ci-dessus plutôt que par le hash.
export function colorForDistributeur(name: string, alpha = 1): string {
  const regionHsl = REGION_COLORS[name];
  if (regionHsl) return `hsla(${regionHsl}, ${alpha})`;

  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = (Math.abs(hash) * 137.508) % 360;
  return `hsla(${hue.toFixed(0)}, 70%, 60%, ${alpha})`;
}
