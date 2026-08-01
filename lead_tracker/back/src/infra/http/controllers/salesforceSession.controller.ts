import { Router } from 'express';
import type { SalesforceSessionCheckResponse, SalesforceSessionStatut } from 'shared/types/salesforceSession';

export interface SalesforceSessionControllerDeps {
  checkSalesforceSession: () => Promise<SalesforceSessionStatut>;
}

export function registerSalesforceSessionController(deps: SalesforceSessionControllerDeps): Router {
  const router = Router();

  router.post('/salesforce/session/check', (_req, res) => {
    deps
      .checkSalesforceSession()
      .then((status) => {
        const body: SalesforceSessionCheckResponse = { status };
        res.json(body);
      })
      .catch((error: unknown) => {
        res.status(500).json({ message: error instanceof Error ? error.message : 'Erreur inconnue' });
      });
  });

  return router;
}
