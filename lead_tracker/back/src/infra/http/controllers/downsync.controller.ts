import { Router } from 'express';
import { DownsyncAlreadyInProgressError } from '../../../core/usecases/downsyncFromSalesforce.uc';

export interface DownsyncControllerDeps {
  downsyncFromSalesforce: (options?: { nouveauxUniquement?: boolean }) => Promise<string>;
}

export function registerDownsyncController(deps: DownsyncControllerDeps): Router {
  const router = Router();

  router.post('/downsync', (req, res) => {
    const nouveauxUniquement = (req.body as { nouveauxUniquement?: boolean } | undefined)?.nouveauxUniquement;
    deps
      .downsyncFromSalesforce({ nouveauxUniquement })
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof DownsyncAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
      });
  });

  return router;
}
