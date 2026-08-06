import { Router } from 'express';
import { UpscanAlreadyInProgressError } from '../../../core/usecases/upscanFromDistributors.uc';

export interface UpscanControllerDeps {
  upscanFromDistributors: () => Promise<string>;
}

export function registerUpscanController(deps: UpscanControllerDeps): Router {
  const router = Router();

  router.post('/upscan', (_req, res) => {
    deps
      .upscanFromDistributors()
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof UpscanAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
      });
  });

  return router;
}
