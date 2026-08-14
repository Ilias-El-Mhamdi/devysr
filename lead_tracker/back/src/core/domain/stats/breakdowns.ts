import type { LeadRecord } from 'shared/types/lead';
import type { ProductsByDistributeur, SourceByDistributeur, StatsCount, StatusByDistributeur } from 'shared/types/stats';
import { isWon } from './leadClassification';
import { EMPTY_VALUE, STATUS_ORDER } from './shared';

export function countBy(values: string[]): StatsCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value && value !== EMPTY_VALUE ? value : 'Unspecified';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function computeProductsByDistributeur(leads: LeadRecord[]): ProductsByDistributeur {
  const products = [...new Set(leads.map((lead) => lead.valeurs['Product Interest']).filter((value) => value && value !== EMPTY_VALUE))].sort();
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = products.map(() => 0);
  }

  for (const lead of leads) {
    const product = lead.valeurs['Product Interest'];
    if (!product || product === EMPTY_VALUE) continue;
    const productIndex = products.indexOf(product);
    if (productIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    counts[distributeur][productIndex] += 1;
  }

  return { products, distributeurs, counts };
}

// Même grille (produits × distributeurs) que computeProductsByDistributeur, mais chaque cellule
// est le taux de conversion (won / total, en %) plutôt que le volume — pour permettre de basculer
// le même graphe empilé entre "qui traite le plus" et "qui convertit le mieux", produit par produit.
export function computeProductConversionByDistributeur(leads: LeadRecord[]): ProductsByDistributeur {
  const products = [...new Set(leads.map((lead) => lead.valeurs['Product Interest']).filter((value) => value && value !== EMPTY_VALUE))].sort();
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const totals: Record<string, number[]> = {};
  const won: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    totals[distributeur] = products.map(() => 0);
    won[distributeur] = products.map(() => 0);
  }

  for (const lead of leads) {
    const product = lead.valeurs['Product Interest'];
    if (!product || product === EMPTY_VALUE) continue;
    const productIndex = products.indexOf(product);
    if (productIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    totals[distributeur][productIndex] += 1;
    if (isWon(lead.valeurs['Lead Status'])) won[distributeur][productIndex] += 1;
  }

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = products.map((_, index) =>
      totals[distributeur][index] > 0 ? Math.round((won[distributeur][index] / totals[distributeur][index]) * 100) : 0,
    );
  }

  return { products, distributeurs, counts };
}

export function computeStatusByDistributeur(leads: LeadRecord[]): StatusByDistributeur {
  const presentStatuses = new Set(leads.map((lead) => lead.valeurs['Lead Status']).filter((value) => value && value !== EMPTY_VALUE));
  const statuses = [
    ...STATUS_ORDER.filter((status) => presentStatuses.has(status)),
    ...[...presentStatuses].filter((status) => !STATUS_ORDER.includes(status)).sort(),
  ];
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = statuses.map(() => 0);
  }

  for (const lead of leads) {
    const status = lead.valeurs['Lead Status'];
    if (!status || status === EMPTY_VALUE) continue;
    const statusIndex = statuses.indexOf(status);
    if (statusIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    counts[distributeur][statusIndex] += 1;
  }

  return { statuses, distributeurs, counts };
}

// Réutilise l'ordre déjà calculé par `sourceBreakdown` (trié par volume desc) plutôt que de
// re-trier alphabétiquement — cohérence visuelle entre le graphe global et celui par distributeur.
export function computeSourceByDistributeur(leads: LeadRecord[], sourceBreakdown: StatsCount[]): SourceByDistributeur {
  const sources = sourceBreakdown.map((s) => s.label);
  const distributeurs = [...new Set(leads.map((lead) => lead.distributeur || 'Unassigned'))].sort();

  const counts: Record<string, number[]> = {};
  for (const distributeur of distributeurs) {
    counts[distributeur] = sources.map(() => 0);
  }

  for (const lead of leads) {
    const raw = lead.valeurs['Lead Source'];
    const label = raw && raw !== EMPTY_VALUE ? raw : 'Unspecified';
    const sourceIndex = sources.indexOf(label);
    if (sourceIndex === -1) continue;
    const distributeur = lead.distributeur || 'Unassigned';
    counts[distributeur][sourceIndex] += 1;
  }

  return { sources, distributeurs, counts };
}
