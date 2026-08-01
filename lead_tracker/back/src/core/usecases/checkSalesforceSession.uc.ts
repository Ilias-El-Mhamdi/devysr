import type { SalesforceSessionStatut } from 'shared/types/salesforceSession';

export interface CheckSalesforceSessionDeps {
  getSalesforceSessionCookie: () => Promise<string | null>;
  pingSalesforceSession: (cookie: string) => Promise<boolean>;
}

// Endpoint stateless : relit le cookie à chaque appel, aucun cache/état en mémoire côté back — la
// boucle de rafraîchissement vit côté front (cf. features/exportLeads.md § Maintien de la session).
export function createCheckSalesforceSessionUseCase(deps: CheckSalesforceSessionDeps) {
  return async function checkSalesforceSession(): Promise<SalesforceSessionStatut> {
    const cookie = await deps.getSalesforceSessionCookie();
    if (!cookie) {
      return 'deconnecte';
    }
    const isValid = await deps.pingSalesforceSession(cookie);
    return isValid ? 'connecte' : 'deconnecte';
  };
}
