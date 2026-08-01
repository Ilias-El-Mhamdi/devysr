import { Router } from 'express';
import { ExportAlreadyInProgressError } from '../../../core/usecases/exportToSalesforce.uc';

export interface ExportControllerDeps {
  exportToSalesforce: (options?: { nouveauxUniquement?: boolean }) => Promise<string>;
}

export function registerExportController(deps: ExportControllerDeps): Router {
  const router = Router();

  router.post('/export', (req, res) => {
    const nouveauxUniquement = (req.body as { nouveauxUniquement?: boolean } | undefined)?.nouveauxUniquement;
    deps
      .exportToSalesforce({ nouveauxUniquement })
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof ExportAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Erreur inconnue' });
      });
  });

  return router;
}
