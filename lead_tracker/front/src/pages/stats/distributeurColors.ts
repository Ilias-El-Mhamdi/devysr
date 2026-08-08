// Couleur déterministe par distributeur (même distributeur = même couleur d'un chargement à
// l'autre) via l'angle d'or, sans dépendre de l'ordre d'itération.
export function colorForDistributeur(name: string, alpha = 1): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = (Math.abs(hash) * 137.508) % 360;
  return `hsla(${hue.toFixed(0)}, 70%, 60%, ${alpha})`;
}
