import { Router } from 'express';
import type { HelloResponse } from 'shared/types/hello';

export function registerHelloController(): Router {
  const router = Router();

  router.get('/hello', (_req, res) => {
    const body: HelloResponse = { message: 'Hello from the lead_tracker backend' };
    res.json(body);
  });

  return router;
}
