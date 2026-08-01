import type { Distributeur } from 'shared/types/distributeur';
import type { LeadRecord } from 'shared/types/lead';
import type { ExportRun, ImportRun, ImportRunInput, ImportRunOutput, ImportRunResume, RunType } from 'shared/types/run';
import { parseSalesforceCsv, csvRowsToLeadValues } from 'shared/parsing/salesforceCsv';
import { hashLeadValues } from '../domain/lead/lead.hash';
import { assignerDistributeur } from '../domain/distributeur/distributeurAssignment';

const SALESFORCE_SESSION_EXPIRED_ERROR = "Session Salesforce expirée. Ouvre Chrome et reconnecte-toi à Salesforce avant de relancer l'import.";
const LEAD_ID_HEADER = 'Lead ID';

export class ImportAlreadyInProgressError extends Error {
  constructor() {
    super('Un import est déjà en cours.');
  }
}

export class ExportRunNotReadyError extends Error {
  constructor() {
    super("Ce run d'export n'est pas utilisable (introuvable, en cours, ou en échec).");
  }
}

interface ChampChange {
  champ: string;
  avant: string | null;
  apres: string;
}

interface LeadFieldMetaLike {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  picklistValues: string[];
}

interface LeadForWorkbook {
  id: string;
  valeurs: Record<string, string>;
}

export interface ImportFromSalesforceDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  getExportRun: (runId: string) => Promise<ExportRun | null>;
  readRunOutputFile: (runId: string, fichier: string) => Promise<string>;
  createRun: (type: 'import', input: ImportRunInput, emptyOutput: ImportRunOutput) => Promise<ImportRun>;
  completeRun: (runId: string, resume: ImportRunResume, output: ImportRunOutput) => Promise<ImportRun>;
  failRun: (runId: string, erreur: string) => Promise<ImportRun>;
  getAllLeads: () => Promise<Record<string, LeadRecord>>;
  upsertLead: (lead: LeadRecord, changements: ChampChange[]) => Promise<void>;
  getAllDistributeurs: () => Promise<Record<string, Distributeur>>;
  saveDistributeur: (distributeur: Distributeur) => Promise<void>;
  getSalesforceSessionCookie: () => Promise<string | null>;
  toBearerToken: (cookie: string) => string;
  fetchLeadFieldsMeta: (bearerToken: string) => Promise<LeadFieldMetaLike[]>;
  appendLeadsToDistributorWorkbook: (
    distributeurNom: string,
    headers: string[],
    leads: LeadForWorkbook[],
    fieldsMeta: LeadFieldMetaLike[],
  ) => Promise<void>;
  logActivity: (activite: { nomActivite: string; nbLead?: number; nbDistributeur?: number; date: string }) => Promise<void>;
}

function diffValeurs(avant: Record<string, string> | undefined, apres: Record<string, string>): ChampChange[] {
  const changements: ChampChange[] = [];
  for (const champ of Object.keys(apres)) {
    const valeurApres = apres[champ];
    const valeurAvant = avant?.[champ] ?? null;
    if (valeurAvant !== valeurApres) {
      changements.push({ champ, avant: valeurAvant, apres: valeurApres });
    }
  }
  return changements;
}

// Best-effort : la date de création dans le CSV Salesforce est déjà localisée (ex. "01/08/2026"),
// pas un format ISO fiable à parser sans ambiguïté. Sert uniquement à trier "À traiter" (le plus
// récent en haut) — en cas d'échec de parsing, le lead est traité comme "le plus ancien" (trié en
// dernier), ce qui ne casse rien de fonctionnel, juste l'ordre d'affichage.
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

// Démarre le run et retourne son id immédiatement ; le traitement se termine en tâche de fond (cf.
// règle CLAUDE.md sur les actions longues — lecture Excel/écriture de potentiellement 50 fichiers).
export function createImportFromSalesforceUseCase(deps: ImportFromSalesforceDeps) {
  return async function importFromSalesforce(exportRunId: string): Promise<string> {
    if (await deps.hasRunInProgress('import')) {
      throw new ImportAlreadyInProgressError();
    }

    const exportRun = await deps.getExportRun(exportRunId);
    if (!exportRun || exportRun.statut !== 'succes' || !exportRun.output.fichier) {
      throw new ExportRunNotReadyError();
    }

    const run = await deps.createRun('import', { exportRunId }, { fichier: null });

    void (async () => {
      try {
        const csv = await deps.readRunOutputFile(exportRunId, exportRun.output.fichier!);
        const { headers, rows } = parseSalesforceCsv(csv);

        if (!headers.some((header) => header.trim().toLowerCase() === LEAD_ID_HEADER.toLowerCase())) {
          throw new Error(`La colonne "${LEAD_ID_HEADER}" doit être présente dans le report Salesforce pour pouvoir importer les leads.`);
        }

        const cookie = await deps.getSalesforceSessionCookie();
        if (!cookie) {
          throw new Error(SALESFORCE_SESSION_EXPIRED_ERROR);
        }
        const fieldsMeta = await deps.fetchLeadFieldsMeta(deps.toBearerToken(cookie));

        const leadsExistants = await deps.getAllLeads();
        const distributeurs = { ...(await deps.getAllDistributeurs()) };

        const nouveauxLeadsParDistributeur = new Map<string, LeadForWorkbook[]>();
        const distributeursNouveaux = new Set<string>();
        let nbLeadNouveaux = 0;
        let nbLeadMisAJour = 0;
        let nbLeadNonAssignes = 0;

        for (const valeurs of csvRowsToLeadValues(headers, rows)) {
          const id = valeurs[headers.find((header) => header.trim().toLowerCase() === LEAD_ID_HEADER.toLowerCase())!];
          if (!id) continue;

          const existant = leadsExistants[id];
          const hash = hashLeadValues(valeurs);
          const estNouveau = !existant;
          const changements = diffValeurs(existant?.valeurs, valeurs);
          const maintenant = new Date().toISOString();

          const assignment = assignerDistributeur(valeurs, distributeurs);
          if (assignment?.estNouveauDistributeur && !distributeurs[assignment.distributeurNom]) {
            distributeurs[assignment.distributeurNom] = assignment.distributeur;
            distributeursNouveaux.add(assignment.distributeurNom);
          }

          const lead: LeadRecord = {
            id,
            valeurs,
            distributeur: assignment?.distributeurNom ?? '',
            hash,
            dateImport: existant?.dateImport ?? maintenant,
            dateDerniereModification: changements.length > 0 || estNouveau ? maintenant : (existant?.dateDerniereModification ?? maintenant),
          };
          await deps.upsertLead(lead, changements);

          if (estNouveau) {
            nbLeadNouveaux += 1;
            if (assignment) {
              const liste = nouveauxLeadsParDistributeur.get(assignment.distributeurNom) ?? [];
              liste.push({ id, valeurs });
              nouveauxLeadsParDistributeur.set(assignment.distributeurNom, liste);
            } else {
              nbLeadNonAssignes += 1;
            }
          } else if (changements.length > 0) {
            nbLeadMisAJour += 1;
          }
        }

        for (const nom of distributeursNouveaux) {
          await deps.saveDistributeur(distributeurs[nom]);
        }

        for (const [distributeurNom, leadsAAjouter] of nouveauxLeadsParDistributeur) {
          const tries = [...leadsAAjouter].sort((a, b) => extractCreationDateMs(a.valeurs) - extractCreationDateMs(b.valeurs));
          await deps.appendLeadsToDistributorWorkbook(distributeurNom, headers, tries, fieldsMeta);
        }

        const resume: ImportRunResume = {
          nbLeadTraites: rows.length,
          nbLeadNouveaux,
          nbLeadMisAJour,
          nbDistributeurCrees: distributeursNouveaux.size,
          nbLeadNonAssignes,
        };
        await deps.completeRun(run.id, resume, { fichier: null });
        await deps.logActivity({
          nomActivite: 'import',
          nbLead: resume.nbLeadTraites,
          nbDistributeur: resume.nbDistributeurCrees,
          date: new Date().toISOString(),
        });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Erreur inconnue');
      }
    })();

    return run.id;
  };
}
