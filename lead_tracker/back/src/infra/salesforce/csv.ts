function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// CSV "Details Only" — une ligne par lead, valeurs déjà formatées par Salesforce (dates, noms de
// owner, etc.) puisqu'on passe par le vrai run de report plutôt qu'une requête SOQL brute.
export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((line) => line.map(csvEscape).join(','));
  return lines.join('\r\n') + '\r\n';
}
