import type { LeadRecord } from 'shared/types/lead';
import { parseSalesforceCsv, csvRowsToLeadValues } from 'shared/parsing/salesforceCsv';
import { hashLeadValues } from '../domain/lead/lead.hash';

const LEAD_ID_HEADER = 'Lead ID';

interface ChampChange {
  champ: string;
  avant: string | null;
  apres: string;
}

export interface ApplyUpscanDiffToLeadsDeps {
  getAllLeads: () => Promise<Record<string, LeadRecord>>;
  upsertLead: (lead: LeadRecord, changements: ChampChange[]) => Promise<void>;
}

// Ferme la boucle upscan → Salesforce → leads.json dès qu'un push est intégralement traité
// (`etatSalesforce === 'JobComplete'` et 0 échec), au lieu d'attendre le prochain cycle Export →
// Import (cf. features/upscan.md § Push). Appliqué par pushToSalesforce.uc (job terminé
// immédiatement) et refreshPushStatus.uc (job encore InProgress au moment du push).
// `editableHeaders` vient du même describe de report que celui utilisé pour construire le CSV Bulk
// — seules ces colonnes sont écrites dans leads.json, jamais les colonnes en lecture seule.
export function createApplyUpscanDiffToLeadsUseCase(deps: ApplyUpscanDiffToLeadsDeps) {
  return async function applyUpscanDiffToLeads(csv: string, editableHeaders: ReadonlySet<string>): Promise<number> {
    const { headers, rows } = parseSalesforceCsv(csv);
    const leadIdHeader = headers.find((header) => header.trim().toLowerCase() === LEAD_ID_HEADER.toLowerCase());
    if (!leadIdHeader) return 0;

    const leadsExistants = await deps.getAllLeads();
    let nbAppliques = 0;

    for (const valeurs of csvRowsToLeadValues(headers, rows)) {
      const id = valeurs[leadIdHeader];
      const existant = id ? leadsExistants[id] : undefined;
      if (!existant) continue;

      const changements: ChampChange[] = [];
      const nouvellesValeurs = { ...existant.valeurs };
      for (const header of headers) {
        if (header === leadIdHeader || !editableHeaders.has(header)) continue;
        const apres = valeurs[header] ?? '';
        const avant = existant.valeurs[header] ?? '';
        if (apres !== avant) {
          changements.push({ champ: header, avant, apres });
          nouvellesValeurs[header] = apres;
        }
      }
      if (changements.length === 0) continue;

      const lead: LeadRecord = {
        ...existant,
        valeurs: nouvellesValeurs,
        hash: hashLeadValues(nouvellesValeurs, editableHeaders),
        dateDerniereModification: new Date().toISOString(),
      };
      await deps.upsertLead(lead, changements);
      nbAppliques += 1;
    }

    return nbAppliques;
  };
}
