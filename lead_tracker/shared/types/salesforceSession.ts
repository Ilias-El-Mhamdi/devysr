export type SalesforceSessionStatut = 'connecte' | 'deconnecte';

export interface SalesforceSessionCheckResponse {
  status: SalesforceSessionStatut;
}
