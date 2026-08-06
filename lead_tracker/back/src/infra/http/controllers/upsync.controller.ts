import { Router } from 'express';
import { UpsyncAlreadyInProgressError } from '../../../core/usecases/upsyncFromDistributors.uc';

export interface UpsyncControllerDeps {
  upsyncFromDistributors: () => Promise<string>;
}

export function registerUpsyncController(deps: UpsyncControllerDeps): Router {
  const router = Router();

  router.post('/upsync', (_req, res) => {
    deps
      .upsyncFromDistributors()
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof UpsyncAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
      });
  });

  return router;
}
