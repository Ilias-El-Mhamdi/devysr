import { Router } from 'express';
import { computeStats } from '../../../core/domain/stats/leadsStats';
import { getAllDistributeurs } from '../../store/distributeurs.store';
import { getAllLeads, getHistorique } from '../../store/leads.store';

export function registerStatsController(): Router {
  const router = Router();

  router.get('/stats', (_req, res) => {
    Promise.all([getAllLeads(), getAllDistributeurs(), getHistorique()])
      .then(([leadsById, distributeursByName, historique]) => {
        const stats = computeStats(Object.values(leadsById), Object.values(distributeursByName), historique);
        res.json(stats);
      })
      .catch((error: unknown) => res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' }));
  });

  return router;
}
