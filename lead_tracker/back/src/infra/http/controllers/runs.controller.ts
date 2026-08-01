import { Router } from 'express';
import type { RunType } from 'shared/types/run';
import { deleteRun, getRun, listRuns, outputFilePath } from '../../store/runs.store';

// Générique : sert aussi bien les runs d'export que d'import (mêmes actions : lister, télécharger
// le fichier produit s'il y en a un, supprimer).
export function registerRunsController(): Router {
  const router = Router();

  router.get('/runs', (req, res) => {
    const type = req.query.type as string | undefined as RunType | undefined;
    if (!type) {
      res.status(400).json({ message: 'Query parameter "type" is required.' });
      return;
    }
    listRuns(type)
      .then((runs) => res.json(runs))
      .catch((error: unknown) => res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' }));
  });

  router.get('/runs/:id/download', (req, res) => {
    void (async () => {
      const run = await getRun(req.params.id);
      if (!run || run.statut !== 'succes' || !run.output.fichier) {
        res.status(404).json({ message: 'File not available for this run.' });
        return;
      }
      res.download(outputFilePath(run.id, run.output.fichier), run.output.fichier);
    })();
  });

  router.delete('/runs/:id', (req, res) => {
    void (async () => {
      const run = await getRun(req.params.id);
      if (!run) {
        res.status(404).json({ message: 'Run not found.' });
        return;
      }
      if (run.statut === 'en_cours') {
        res.status(409).json({ message: 'Cannot delete a run in progress.' });
        return;
      }
      await deleteRun(req.params.id);
      res.status(204).end();
    })();
  });

  return router;
}
