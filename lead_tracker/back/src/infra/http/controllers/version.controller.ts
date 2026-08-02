import { Router } from 'express';
import { config } from '../../../config';

export function registerVersionController(): Router {
  const router = Router();

  router.get('/version', (_req, res) => {
    res.json({ version: config.version });
  });

  return router;
}
