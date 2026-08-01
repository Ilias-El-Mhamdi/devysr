import { config } from '../../config';

const API_VERSION = 'v61.0';

export interface LeadFieldMeta {
  name: string;
  nillable: boolean;
}

// Utilisé uniquement pour savoir quels champs sont obligatoires (validation Excel "non vide") —
// les picklists et leurs valeurs viennent directement du describe du report (cf.
// importFromSalesforce.uc.ts § buildColumnValidations), pas de ce describe-ci.
export async function fetchLeadFieldsMeta(bearerToken: string): Promise<LeadFieldMeta[]> {
  const url = `https://${config.salesforce.instanceHost}/services/data/${API_VERSION}/sobjects/Lead/describe`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
  if (!response.ok) {
    throw new Error(`Failed to read the Lead object definition (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as { fields: { name: string; nillable: boolean }[] };
  return body.fields.map((field) => ({ name: field.name, nillable: field.nillable }));
}
