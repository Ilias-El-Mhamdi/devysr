function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Fonction pure (pas d'I/O), réutilisée par plusieurs run types (export, upscan) — la lib
// ne doit toucher au disque nulle part, c'est le rôle de l'infra qui l'appelle.
export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((line) => line.map(csvEscape).join(','));
  return lines.join('\r\n') + '\r\n';
}
