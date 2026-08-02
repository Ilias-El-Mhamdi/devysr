import { Router } from 'express';
import { ExportRunNotReadyError, VerifyAlreadyInProgressError } from '../../../core/usecases/verify.uc';

export interface VerifyControllerDeps {
  verify: (exportRunId: string) => Promise<string>;
}

export function registerVerifyController(deps: VerifyControllerDeps): Router {
  const router = Router();

  router.post('/verify', (req, res) => {
    const exportRunId = (req.body as { exportRunId?: string } | undefined)?.exportRunId;
    if (!exportRunId) {
      res.status(400).json({ message: 'exportRunId is required.' });
      return;
    }

    deps
      .verify(exportRunId)
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof VerifyAlreadyInProgressError) {
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
