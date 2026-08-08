export const EMPTY_VALUE = '-';
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const STALE_AFTER_DAYS = 30;

export const STATUS_ORDER = ['Open - Not Contacted', 'Working - Contacted', 'Closed - Converted', 'Closed - Not Converted'];

// Format Salesforce "Create Date"/"Last Modified" : JJ/MM/AAAA. `null` si vide ou illisible.
export function parseSalesforceDate(value: string | undefined): Date | null {
  if (!value || value === EMPTY_VALUE) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

// Arrondi à 0.1 près : au-delà, deux distributeurs "mis à jour il y a 7.38j" et "7.41j" s'affichent
// identiques (7.4j) mais ne sont jamais considérés égaux par un tri — l'arrondi à la source évite
// cet ordre incohérent avec ce qui est affiché.
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return roundToOneDecimal(sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
