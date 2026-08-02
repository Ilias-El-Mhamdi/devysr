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

interface LeadRow {
  id: string;
  valeurs: Record<string, string>;
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

// Best-effort, même heuristique que core/usecases/importFromSalesforce.uc.ts § extractCreationDateMs
// (dupliquée ici plutôt que partagée : petite fonction pure, pas besoin d'accoupler infra/core pour ça).
function extractCreationDateMs(valeurs: Record<string, string>): number {
  const header = Object.keys(valeurs).find((key) => /date/i.test(key) && /(creat|création)/i.test(key));
  const raw = header ? valeurs[header] : undefined;
  if (!raw) return 0;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return 0;
  const [, jour, mois, annee] = match;
  const ms = Date.UTC(Number(annee), Number(mois) - 1, Number(jour));
  return Number.isNaN(ms) ? 0 : ms;
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
// reposer (et donc sans risquer de perturber les lignes existantes). Utilisé uniquement sur "Leads"
// — les feuilles de statut sont des vues lecture seule, rien à valider en saisie.
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
async function applyEditableProtection(sheet: ExcelJS.Worksheet, headers: string[], columnRules: Record<string, ColumnRule>): Promise<void> {
  headers.forEach((header, index) => {
    if (columnRules[header]?.editable) {
      sheet.getColumn(index + 2).protection = { locked: false };
    }
  });
  await protectSheet(sheet);
}

// Les feuilles de statut sont des VUES dérivées de "Leads" (jamais une copie indépendante avec son
// propre état éditable) — entièrement verrouillées, aucune colonne déverrouillée. La modification
// d'un lead se fait uniquement sur "Leads" ; ces feuilles ne servent qu'à naviguer/filtrer.
async function applyReadOnlyProtection(sheet: ExcelJS.Worksheet): Promise<void> {
  await protectSheet(sheet);
}

async function protectSheet(sheet: ExcelJS.Worksheet): Promise<void> {
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

async function loadOrCreateWorkbook(filePath: string, headers: string[], columnRules: Record<string, ColumnRule>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
    return workbook;
  } catch {
    for (const sheetName of [LEADS_SHEET, ...STATUS_SHEETS]) {
      const sheet = workbook.addWorksheet(sheetName);
      sheet.addRow(['Lead ID', ...headers]);
      sheet.getRow(1).font = { bold: true };
    }
    const listeRanges = buildListesSheet(workbook, columnRules);
    applyValidations(workbook.getWorksheet(LEADS_SHEET)!, headers, columnRules, listeRanges);
    await applyEditableProtection(workbook.getWorksheet(LEADS_SHEET)!, headers, columnRules);
    return workbook;
  }
}

// Retire toutes les lignes de données (tout sauf l'en-tête) pour reconstruire une feuille de vue à
// l'identique du contenu courant de "Leads".
function clearDataRows(sheet: ExcelJS.Worksheet): void {
  if (sheet.rowCount > 1) {
    sheet.spliceRows(2, sheet.rowCount - 1);
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text;
  if (typeof value === 'object' && 'result' in value) return cellText(value.result);
  return '';
}

function readAllLeadRows(sheet: ExcelJS.Worksheet, headers: string[]): LeadRow[] {
  const rows: LeadRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellText(row.getCell(1).value).trim();
    if (!id) return;
    const valeurs: Record<string, string> = {};
    headers.forEach((header, index) => {
      valeurs[header] = cellText(row.getCell(index + 2).value);
    });
    rows.push({ id, valeurs });
  });
  return rows;
}

// Reconstruit entièrement les 3 feuilles de statut à partir du contenu actuel de "Leads" — jamais
// une copie indépendante : une seule source de vérité par fichier (cf. features/upsync.md).
async function rebuildStatusSheets(sheets: Map<string, ExcelJS.Worksheet>, headers: string[], allLeads: LeadRow[]): Promise<void> {
  const statutHeader = findStatutHeader(headers);
  const parStatut = new Map<string, LeadRow[]>();
  for (const lead of allLeads) {
    const sheetName = classifySheet(statutHeader ? lead.valeurs[statutHeader] : undefined);
    const liste = parStatut.get(sheetName) ?? [];
    liste.push(lead);
    parStatut.set(sheetName, liste);
  }

  for (const sheetName of STATUS_SHEETS) {
    const sheet = sheets.get(sheetName)!;
    sheet.unprotect();
    clearDataRows(sheet);
    const leadsForSheet = (parStatut.get(sheetName) ?? []).sort((a, b) => extractCreationDateMs(b.valeurs) - extractCreationDateMs(a.valeurs));
    for (const lead of leadsForSheet) {
      sheet.addRow([lead.id, ...headers.map((header) => lead.valeurs[header] ?? '')]);
    }
    await applyReadOnlyProtection(sheet);
  }
}

export interface LeadForWorkbook {
  id: string;
  valeurs: Record<string, string>;
}

// Append-only sur "Leads" : les lignes déjà présentes (et leurs commentaires Excel éventuels) ne
// sont jamais modifiées ni supprimées — le fichier est partagé avec le distributeur, et "Leads" est
// la seule feuille éditable (source unique de vérité). Les 3 feuilles de statut ("À traiter" / "En
// cours de traitement" / "Traités") sont entièrement régénérées à chaque écriture à partir du
// contenu courant de "Leads" (donc toujours cohérentes avec les éventuelles modifications déjà
// faites par le distributeur sur "Leads"), triées par date de création décroissante, verrouillées.
// Limite connue : si un distributeur ne reçoit aucun nouveau lead lors d'un import, son fichier
// n'est pas touché et ses vues de statut ne reflètent pas d'éventuelles modifications de Lead Status
// faites entre-temps sur "Leads" — elles se remettront à jour au prochain import qui le concerne.
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
  const workbook = await loadOrCreateWorkbook(filePath, headers, columnRules);
  const allSheetNames = [LEADS_SHEET, ...STATUS_SHEETS];
  const sheets = new Map(allSheetNames.map((name) => [name, workbook.getWorksheet(name)]));
  if (allSheetNames.some((name) => !sheets.get(name))) {
    throw new Error(`Invalid Excel file for distributor "${distributeurNom}" (expected sheets are missing).`);
  }

  const leadsSheet = sheets.get(LEADS_SHEET)!;
  for (const lead of leads) {
    leadsSheet.addRow([lead.id, ...headers.map((header) => lead.valeurs[header] ?? '')]);
  }

  const allLeads = readAllLeadRows(leadsSheet, headers);
  await rebuildStatusSheets(sheets as Map<string, ExcelJS.Worksheet>, headers, allLeads);

  await workbook.xlsx.writeFile(filePath);
}

export interface DistributorLeadsSheet {
  headers: string[];
  rows: LeadRow[];
}

// Noms de fichiers présents dans data/distributeurs/ (sans l'extension) — utilisé par Upsync pour
// parcourir tous les distributeurs sans dépendre de distributeurs.json (un fichier peut exister
// même si son entrée a été renommée/modifiée côté JSON).
export async function listDistributorNames(): Promise<string[]> {
  await fs.mkdir(DISTRIBUTORS_DIR, { recursive: true });
  const entries = await fs.readdir(DISTRIBUTORS_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.xlsx')).map((entry) => entry.name.slice(0, -'.xlsx'.length));
}

// Lit la feuille "Leads" (seule feuille éditable) telle quelle : en-têtes propres au fichier (pas
// ceux du report courant, au cas où ils auraient changé depuis la création du fichier) + valeurs
// actuelles de chaque ligne, potentiellement modifiées par le distributeur — cf. features/upsync.md.
export async function readDistributorLeadsSheet(distributeurNom: string): Promise<DistributorLeadsSheet | null> {
  const filePath = workbookPath(distributeurNom);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch {
    return null;
  }

  const sheet = workbook.getWorksheet(LEADS_SHEET);
  if (!sheet) {
    return null;
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let col = 2; col <= headerRow.cellCount; col += 1) {
    headers.push(cellText(headerRow.getCell(col).value));
  }

  return { headers, rows: readAllLeadRows(sheet, headers) };
}
