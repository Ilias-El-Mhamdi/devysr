import type {
  PushJobEtat,
  PushRun,
  PushRunResume,
  RunType,
  UpscanRun,
  UpsyncRun,
  UpsyncRunInput,
  UpsyncRunOutput,
  UpsyncRunResume,
} from 'shared/types/run';

export class UpsyncAlreadyInProgressError extends Error {
  constructor() {
    super('An upsync is already in progress.');
  }
}

export interface UpsyncFromDistributorsDeps {
  hasRunInProgress: (type: RunType) => Promise<boolean>;
  createRun: (type: 'upsync', input: UpsyncRunInput, emptyOutput: UpsyncRunOutput) => Promise<UpsyncRun>;
  patchRunResume: (runId: string, resume: UpsyncRunResume) => Promise<UpsyncRun>;
  completeRun: (runId: string, resume: UpsyncRunResume, output: UpsyncRunOutput) => Promise<UpsyncRun>;
  failRun: (runId: string, erreur: string) => Promise<UpsyncRun>;
  getUpscanRun: (runId: string) => Promise<UpscanRun | null>;
  getPushRun: (runId: string) => Promise<PushRun | null>;
  upscanFromDistributors: () => Promise<string>;
  pushToSalesforce: (upscanRunId: string) => Promise<string>;
  // Même effet qu'un clic sur "Refresh status" dans la section Upload — le job Bulk API est
  // asynchrone côté Salesforce, un statut "succes" sur le push run signifie juste "soumis avec
  // succès", pas "traité". Réutilisé ici pour ne pas dupliquer la logique d'application des
  // valeurs éditables à leads.json une fois le job réellement terminé (cf. refreshPushStatus.uc.ts).
  refreshPushStatus: (pushRunId: string) => Promise<PushRunResume>;
  logActivity: (activite: { nomActivite: string; nbLead?: number; nbDistributeur?: number; date: string }) => Promise<void>;
}

const POLL_INTERVAL_MS = 1000;
const PUSH_STATUS_POLL_INTERVAL_MS = 3000;

function isPushTerminal(etat: PushJobEtat): boolean {
  return etat === 'JobComplete' || etat === 'Failed' || etat === 'Aborted';
}

// UpScan et push restent deux runs à part entière (visibles dans leurs propres sections) — upsync
// ne fait qu'orchestrer leur enchaînement et exposer une progression unifiée, même logique que
// downsyncFromSalesforce.uc.ts côté Export → Import. Polling du run.store plutôt qu'un
// event/callback, comme partout ailleurs pour les actions longues (cf. CLAUDE.md).
async function waitForUpscanRun(getUpscanRun: UpsyncFromDistributorsDeps['getUpscanRun'], runId: string): Promise<UpscanRun> {
  for (;;) {
    const run = await getUpscanRun(runId);
    if (!run) throw new Error(`Upscan run not found: ${runId}`);
    if (run.statut !== 'en_cours') return run;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Attend uniquement la soumission du job (création + upload + fermeture + premier statut) — pas
// sa fin de traitement côté Salesforce, cf. pollPushUntilTerminal ci-dessous pour la suite.
async function waitForPushRun(getPushRun: UpsyncFromDistributorsDeps['getPushRun'], runId: string): Promise<PushRun> {
  for (;;) {
    const run = await getPushRun(runId);
    if (!run) throw new Error(`Push run not found: ${runId}`);
    if (run.statut !== 'en_cours') return run;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Démarre le run et retourne son id immédiatement ; l'enchaînement upscan → push se déroule en
// tâche de fond (le front suit `resume.etape` via GET /api/runs).
export function createUpsyncFromDistributorsUseCase(deps: UpsyncFromDistributorsDeps) {
  return async function upsyncFromDistributors(): Promise<string> {
    if (await deps.hasRunInProgress('upsync')) {
      throw new UpsyncAlreadyInProgressError();
    }

    const run = await deps.createRun('upsync', {}, {});

    void (async () => {
      let resume: UpsyncRunResume = {
        etape: 'upscan',
        upscanRunId: null,
        pushRunId: null,
        nbFichiersLus: null,
        nbLeadModifies: null,
        nbDistributeursImpactes: null,
        anomalies: [],
        etatSalesforce: null,
        nbEnregistresTraites: null,
        nbEnregistresEnEchec: null,
      };

      try {
        await deps.patchRunResume(run.id, resume);

        const upscanRunId = await deps.upscanFromDistributors();
        resume = { ...resume, upscanRunId };
        await deps.patchRunResume(run.id, resume);

        const upscanRun = await waitForUpscanRun(deps.getUpscanRun, upscanRunId);
        if (upscanRun.statut !== 'succes') {
          throw new Error(upscanRun.erreur ?? 'Upscan failed.');
        }

        resume = {
          ...resume,
          nbFichiersLus: upscanRun.resume?.nbFichiersLus ?? null,
          nbLeadModifies: upscanRun.resume?.nbLeadModifies ?? null,
          nbDistributeursImpactes: upscanRun.resume?.nbDistributeursImpactes ?? null,
          anomalies: upscanRun.resume?.anomalies ?? [],
        };

        if (!upscanRun.resume?.nbLeadModifies) {
          // Rien à pousser : pushToSalesforce refuserait de toute façon un upscan sans lead
          // modifié (UpscanRunNotReadyError) — upsync s'arrête proprement après l'upscan.
          resume = { ...resume, etape: 'termine' };
          await deps.completeRun(run.id, resume, {});
          await deps.logActivity({ nomActivite: 'upsync', nbLead: 0, date: new Date().toISOString() });
          return;
        }

        resume = { ...resume, etape: 'push' };
        await deps.patchRunResume(run.id, resume);

        const pushRunId = await deps.pushToSalesforce(upscanRunId);
        resume = { ...resume, pushRunId };
        await deps.patchRunResume(run.id, resume);

        const pushRun = await waitForPushRun(deps.getPushRun, pushRunId);
        if (pushRun.statut !== 'succes' || !pushRun.resume) {
          throw new Error(pushRun.erreur ?? 'Push failed.');
        }

        let pushResume = pushRun.resume;
        resume = {
          ...resume,
          etatSalesforce: pushResume.etatSalesforce,
          nbEnregistresTraites: pushResume.nbEnregistresTraites,
          nbEnregistresEnEchec: pushResume.nbEnregistresEnEchec,
        };
        await deps.patchRunResume(run.id, resume);

        // Le job Bulk API est soumis mais pas forcément traité — on continue de le sonder toutes
        // les 3s (équivalent du bouton "Refresh status") jusqu'à un état terminal.
        while (!isPushTerminal(pushResume.etatSalesforce)) {
          await new Promise((resolve) => setTimeout(resolve, PUSH_STATUS_POLL_INTERVAL_MS));
          pushResume = await deps.refreshPushStatus(pushRunId);
          resume = {
            ...resume,
            etatSalesforce: pushResume.etatSalesforce,
            nbEnregistresTraites: pushResume.nbEnregistresTraites,
            nbEnregistresEnEchec: pushResume.nbEnregistresEnEchec,
          };
          await deps.patchRunResume(run.id, resume);
        }

        if (pushResume.etatSalesforce !== 'JobComplete') {
          throw new Error(`Salesforce push ${pushResume.etatSalesforce.toLowerCase()} (${pushResume.nbEnregistresEnEchec ?? 0} failed).`);
        }

        resume = { ...resume, etape: 'termine' };
        await deps.completeRun(run.id, resume, {});
        await deps.logActivity({
          nomActivite: 'upsync',
          nbLead: resume.nbEnregistresTraites ?? undefined,
          nbDistributeur: resume.nbDistributeursImpactes ?? undefined,
          date: new Date().toISOString(),
        });
      } catch (error) {
        await deps.failRun(run.id, error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return run.id;
  };
}
