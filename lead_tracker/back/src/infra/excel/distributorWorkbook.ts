import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';

const DISTRIBUTORS_DIR = path.resolve(__dirname, '../../../data/distributeurs');
const LEADS_SHEET = 'Leads';
const A_TRAITER_SHEET = 'À traiter';
const EN_COURS_SHEET = 'En cours de traitement';
const TRAITES_SHEET = 'Traités';
const LISTES_SHEET = 'Listes';
const STATUS_SHEETS = [A_TRAITER_SHEET, EN_COURS_SHEET, TRAITES_SHEET];
const MAX_VALIDATION_ROWS = 5000;

// Mapping sur les valeurs standard du picklist Lead Status Salesforce (Open/Working/Closed). Un
// statut personnalisé non reconnu retombe sur "À traiter" par défaut plutôt que de planter.
const STATUTS_TRAITES = ['closed - converted', 'closed - not converted'];
const STATUTS_EN_COURS = ['working - contacted'];

export interface ColumnRule {
  picklistValues: string[];
  required: boolean;
  editable: boolean;
}

function workbookPath(distributeurNom: string): string {
  const safeName = distributeurNom.replace(/[\\/:*?"<>|]/g, '_');
  return path.join(DISTRIBUTORS_DIR, `${safeName}.xlsx`);
}

function classifySheet(statut: string | undefined): string {
  const normalized = statut?.trim().toLowerCase();
  if (normalized && STATUTS_TRAITES.includes(normalized)) return TRAITES_SHEET;
  if (normalized && STATUTS_EN_COURS.includes(normalized)) return EN_COURS_SHEET;
  return A_TRAITER_SHEET;
}

function findStatutHeader(headers: string[]): string | undefined {
  return headers.find((header) => header.trim().toLowerCase() === 'lead status');
}

// `worksheet.dataValidations.add(range, validation)` existe à l'exécution (une seule règle par
// plage, cf. node_modules/exceljs/lib/doc/data-validations.js) mais n'est pas déclaré dans les
// types fournis par la lib — d'où le cast.
interface WorksheetWithDataValidations {
  dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
}

// Une liste Excel passée en formule inline ("val1,val2,...") est limitée à 255 caractères — trop
// court pour un picklist comme Country (~200 valeurs). On écrit donc les valeurs dans une feuille
// masquée et on référence la plage, sans limite pratique de longueur.
// Écrit via `addRow` (comme les feuilles visibles) : une écriture cellule par cellule sur une
// feuille `veryHidden` ne persistait pas les valeurs (testé — la feuille se retrouvait vide malgré
// les dimensions calculées), `addRow` fonctionne de façon fiable.
function buildListesSheet(workbook: ExcelJS.Workbook, columnRules: Record<string, ColumnRule>): Map<string, string> {
  const sheet = workbook.addWorksheet(LISTES_SHEET, { state: 'veryHidden' });
  const entries = Object.entries(columnRules).filter(([, rule]) => rule.picklistValues.length > 0);
  const ranges = new Map<string, string>();
  if (entries.length === 0) {
    return ranges;
  }

  const maxLength = Math.max(...entries.map(([, rule]) => rule.picklistValues.length));
  for (let rowIndex = 0; rowIndex < maxLength; rowIndex += 1) {
    sheet.addRow(entries.map(([, rule]) => rule.picklistValues[rowIndex] ?? ''));
  }

  entries.forEach(([header, rule], index) => {
    const colLetter = sheet.getColumn(index + 1).letter;
    ranges.set(header, `${LISTES_SHEET}!$${colLetter}$1:$${colLetter}$${rule.picklistValues.length}`);
  });

  return ranges;
}

// Dropdowns pour les picklists Salesforce + validation "non vide" pour les champs obligatoires —
// posées une seule fois à la création du fichier, sur une plage large (au-delà des lignes déjà
// remplies) pour couvrir aussi les lignes ajoutées lors des imports suivants sans avoir à les
// reposer (et donc sans risquer de perturber les lignes existantes).
function applyValidations(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  columnRules: Record<string, ColumnRule>,
  listeRanges: Map<string, string>,
): void {
  const dataValidations = (sheet as unknown as WorksheetWithDataValidations).dataValidations;

  headers.forEach((header, index) => {
    const rule = columnRules[header];
    if (!rule) return;

    const columnNumber = index + 2; // +1 colonne Lead ID, +1 index 1-based ExcelJS
    const colLetter = sheet.getColumn(columnNumber).letter;
    const range = `${colLetter}2:${colLetter}${MAX_VALIDATION_ROWS + 1}`;
    const listeRange = listeRanges.get(header);

    if (listeRange) {
      dataValidations.add(range, {
        type: 'list',
        allowBlank: !rule.required,
        formulae: [listeRange],
        showErrorMessage: true,
        error: 'Valeur invalide — choisis parmi la liste.',
      });
    } else if (rule.required) {
      dataValidations.add(range, {
        type: 'custom',
        allowBlank: false,
        formulae: [`LEN(TRIM(${colLetter}2))>0`],
        showErrorMessage: true,
        error: 'Ce champ est obligatoire.',
      });
    }
  });
}

// Verrouille toutes les colonnes sauf celles marquées éditables (Email, Phone, Description, Lead
// Status... cf. features/importDistributeurs.md). Excel verrouille toutes les cellules par défaut
// dès qu'une feuille est protégée : il suffit donc de déverrouiller explicitement les colonnes
// éditables, pas de verrouiller les autres. Sélection/copie restent autorisées (utile pour ajouter
// un commentaire Excel sur une cellule en lecture seule).
async function applyProtection(sheet: ExcelJS.Worksheet, headers: string[], columnRules: Record<string, ColumnRule>): Promise<void> {
  headers.forEach((header, index) => {
    if (columnRules[header]?.editable) {
      sheet.getColumn(index + 2).protection = { locked: false };
    }
  });

  await sheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });
}

async function loadOrCreateWorkbook(
  filePath: string,
  headers: string[],
  columnRules: Record<string, ColumnRule>,
): Promise<{ workbook: ExcelJS.Workbook; isNew: boolean }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
    return { workbook, isNew: false };
  } catch {
    for (const sheetName of [LEADS_SHEET, ...STATUS_SHEETS]) {
      const sheet = workbook.addWorksheet(sheetName);
      sheet.addRow(['Lead ID', ...headers]);
      sheet.getRow(1).font = { bold: true };
    }
    const listeRanges = buildListesSheet(workbook, columnRules);
    for (const sheetName of [LEADS_SHEET, ...STATUS_SHEETS]) {
      const sheet = workbook.getWorksheet(sheetName)!;
      applyValidations(sheet, headers, columnRules, listeRanges);
      await applyProtection(sheet, headers, columnRules);
    }
    return { workbook, isNew: true };
  }
}

export interface LeadForWorkbook {
  id: string;
  valeurs: Record<string, string>;
}

// Append-only : les lignes déjà présentes (et leurs commentaires Excel éventuels) ne sont jamais
// modifiées ni supprimées — le fichier est partagé avec le distributeur. "Leads" reçoit tous les
// nouveaux leads en bas ; chaque lead est aussi ajouté à UNE des trois feuilles de statut ("À
// traiter" / "En cours de traitement" / "Traités", selon Lead Status), en insertion juste après
// l'en-tête plutôt qu'en bas, pour que les plus récents restent en haut sans déplacer les lignes
// déjà présentes plus que nécessaire.
// `leads` doit être trié du plus ancien au plus récent : chaque insertion en position 2 pousse les
// précédentes vers le bas, donc le dernier inséré (le plus récent) se retrouve en haut.
export async function appendLeadsToDistributorWorkbook(
  distributeurNom: string,
  headers: string[],
  leads: LeadForWorkbook[],
  columnRules: Record<string, ColumnRule>,
): Promise<void> {
  if (leads.length === 0) {
    return;
  }
  await fs.mkdir(DISTRIBUTORS_DIR, { recursive: true });

  const filePath = workbookPath(distributeurNom);
  const { workbook } = await loadOrCreateWorkbook(filePath, headers, columnRules);
  const allSheetNames = [LEADS_SHEET, ...STATUS_SHEETS];
  const sheets = new Map(allSheetNames.map((name) => [name, workbook.getWorksheet(name)]));
  if (allSheetNames.some((name) => !sheets.get(name))) {
    throw new Error(`Invalid Excel file for distributor "${distributeurNom}" (expected sheets are missing).`);
  }

  const leadsSheet = sheets.get(LEADS_SHEET)!;
  for (const lead of leads) {
    leadsSheet.addRow([lead.id, ...headers.map((header) => lead.valeurs[header] ?? '')]);
  }

  const statutHeader = findStatutHeader(headers);
  const parStatut = new Map<string, LeadForWorkbook[]>();
  for (const lead of leads) {
    const sheetName = classifySheet(statutHeader ? lead.valeurs[statutHeader] : undefined);
    const liste = parStatut.get(sheetName) ?? [];
    liste.push(lead);
    parStatut.set(sheetName, liste);
  }
  for (const sheetName of STATUS_SHEETS) {
    const sheet = sheets.get(sheetName)!;
    for (const lead of parStatut.get(sheetName) ?? []) {
      sheet.insertRow(2, [lead.id, ...headers.map((header) => lead.valeurs[header] ?? '')]);
    }
  }

  await workbook.xlsx.writeFile(filePath);
}
