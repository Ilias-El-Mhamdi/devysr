export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

// Parse le CSV produit par exportJob.ts côté back (RFC4180 : champs entre guillemets si `,`/`"`/
// retour à la ligne, `""` pour échapper un guillemet). Vit dans shared/ car c'est une fonction pure
// commune, réutilisable des deux côtés — cf. CLAUDE.md § Types partagés.
export function parseSalesforceCsv(csv: string): ParsedCsv {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const [headers, ...dataRows] = nonEmptyRows;
  return { headers: headers ?? [], rows: dataRows };
}

export function csvRowsToLeadValues(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const valeurs: Record<string, string> = {};
    headers.forEach((header, index) => {
      valeurs[header] = row[index] ?? '';
    });
    return valeurs;
  });
}
