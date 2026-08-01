import { config } from '../../config';

const API_VERSION = 'v61.0';

export interface LeadFieldMeta {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  picklistValues: string[];
}

// Utilisé uniquement pour enrichir l'Excel distributeur (dropdowns + champs obligatoires) — pas
// pour la donnée elle-même (cf. leçon de features/exportLeads.md : le matching par label peut
// rater une colonne cross-objet ou renommée). Si une colonne du report ne matche aucun champ Lead
// ici, elle est juste servie sans validation Excel plutôt que de faire échouer l'import.
export async function fetchLeadFieldsMeta(bearerToken: string): Promise<LeadFieldMeta[]> {
  const url = `https://${config.salesforce.instanceHost}/services/data/${API_VERSION}/sobjects/Lead/describe`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
  if (!response.ok) {
    throw new Error(`Lecture de la définition de l'objet Lead échouée (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as {
    fields: { name: string; label: string; type: string; nillable: boolean; picklistValues?: { value: string; active: boolean }[] }[];
  };
  return body.fields.map((field) => ({
    name: field.name,
    label: field.label,
    type: field.type,
    nillable: field.nillable,
    picklistValues: (field.picklistValues ?? []).filter((value) => value.active).map((value) => value.value),
  }));
}

export function findFieldMetaByLabel(fields: LeadFieldMeta[], label: string): LeadFieldMeta | undefined {
  const target = label.trim().toLowerCase();
  return fields.find((field) => field.label.trim().toLowerCase() === target);
}
