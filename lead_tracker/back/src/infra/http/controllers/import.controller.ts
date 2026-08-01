import { Router } from 'express';
import { ExportRunNotReadyError, ImportAlreadyInProgressError } from '../../../core/usecases/importFromSalesforce.uc';

export interface ImportControllerDeps {
  importFromSalesforce: (exportRunId: string) => Promise<string>;
}

export function registerImportController(deps: ImportControllerDeps): Router {
  const router = Router();

  router.post('/import', (req, res) => {
    const exportRunId = (req.body as { exportRunId?: string } | undefined)?.exportRunId;
    if (!exportRunId) {
      res.status(400).json({ message: 'exportRunId is required.' });
      return;
    }

    deps
      .importFromSalesforce(exportRunId)
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof ImportAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        if (error instanceof ExportRunNotReadyError) {
          res.status(400).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
      });
  });

  return router;
}
