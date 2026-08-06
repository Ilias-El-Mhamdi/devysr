import { Router } from 'express';
import type { PushRunResume } from 'shared/types/run';
import { PushAlreadyInProgressError, UpscanRunNotReadyError } from '../../../core/usecases/pushToSalesforce.uc';
import { PushRunNotFoundError } from '../../../core/usecases/refreshPushStatus.uc';

export interface PushControllerDeps {
  pushToSalesforce: (upscanRunId: string) => Promise<string>;
  refreshPushStatus: (pushRunId: string) => Promise<PushRunResume>;
}

export function registerPushController(deps: PushControllerDeps): Router {
  const router = Router();

  router.post('/push', (req, res) => {
    const upscanRunId = (req.body as { upscanRunId?: string } | undefined)?.upscanRunId;
    if (!upscanRunId) {
      res.status(400).json({ message: 'upscanRunId is required.' });
      return;
    }

    deps
      .pushToSalesforce(upscanRunId)
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof PushAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        if (error instanceof UpscanRunNotReadyError) {
          res.status(400).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
      });
  });

  router.post('/push/:id/refresh', (req, res) => {
    deps
      .refreshPushStatus(req.params.id)
      .then((resume) => res.json(resume))
      .catch((error: unknown) => {
        if (error instanceof PushRunNotFoundError) {
          res.status(404).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
      });
  });

  return router;
}
