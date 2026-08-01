import { Router } from 'express';
import type { Run } from 'shared/types/run';
import { ExportAlreadyInProgressError } from '../../../core/usecases/exportToSalesforce.uc';
import { deleteRun, getRun, listRuns, outputFilePath } from '../../store/runs.store';

export interface ExportControllerDeps {
  exportToSalesforce: () => Promise<string>;
}

export function registerExportController(deps: ExportControllerDeps): Router {
  const router = Router();

  router.post('/export', (_req, res) => {
    deps
      .exportToSalesforce()
      .then((runId) => res.status(202).json({ runId }))
      .catch((error: unknown) => {
        if (error instanceof ExportAlreadyInProgressError) {
          res.status(409).json({ message: error.message });
          return;
        }
        res.status(500).json({ message: error instanceof Error ? error.message : 'Erreur inconnue' });
      });
  });

  router.get('/runs', (req, res) => {
    const type = (req.query.type as string | undefined) ?? 'export';
    listRuns(type as Run['type'])
      .then((runs) => res.json(runs))
      .catch((error: unknown) => res.status(500).json({ message: error instanceof Error ? error.message : 'Erreur inconnue' }));
  });

  router.get('/runs/:id/download', (req, res) => {
    void (async () => {
      const run = await getRun(req.params.id);
      if (!run || run.statut !== 'succes' || !run.output.fichier) {
        res.status(404).json({ message: 'Fichier indisponible pour ce run.' });
        return;
      }
      res.download(outputFilePath(run.id, run.output.fichier), run.output.fichier);
    })();
  });

  router.delete('/runs/:id', (req, res) => {
    void (async () => {
      const run = await getRun(req.params.id);
      if (!run) {
        res.status(404).json({ message: 'Run introuvable.' });
        return;
      }
      if (run.statut === 'en_cours') {
        res.status(409).json({ message: 'Impossible de supprimer un run en cours.' });
        return;
      }
      await deleteRun(req.params.id);
      res.status(204).end();
    })();
  });

  return router;
}
