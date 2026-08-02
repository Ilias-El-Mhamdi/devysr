import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AnyRun, RunType } from 'shared/types/run';
import { DATA_DIR } from '../../paths';

const RUNS_DIR = path.join(DATA_DIR, 'runs');

function runDir(runId: string): string {
  return path.join(RUNS_DIR, runId);
}

function runJsonPath(runId: string): string {
  return path.join(runDir(runId), 'run.json');
}

async function writeRun(run: AnyRun): Promise<void> {
  await fs.writeFile(runJsonPath(run.id), JSON.stringify(run, null, 2), 'utf-8');
}

export async function createRun<T extends AnyRun>(type: T['type'], input: T['input'], emptyOutput: T['output']): Promise<T> {
  const id = randomUUID();
  await fs.mkdir(path.join(runDir(id), 'input'), { recursive: true });
  await fs.mkdir(path.join(runDir(id), 'output'), { recursive: true });
  await fs.writeFile(path.join(runDir(id), 'input', 'request.json'), JSON.stringify(input, null, 2), 'utf-8');

  const run = {
    id,
    type,
    statut: 'en_cours',
    dateDebut: new Date().toISOString(),
    dateFin: null,
    resume: null,
    input,
    output: emptyOutput,
    erreur: null,
  } as T;
  await writeRun(run);
  return run;
}

export async function completeRun<T extends AnyRun>(runId: string, resume: T['resume'], output: T['output']): Promise<T> {
  const run = await getRun<T>(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  const updated = { ...run, statut: 'succes', dateFin: new Date().toISOString(), resume, output } as T;
  await writeRun(updated);
  return updated;
}

export async function failRun<T extends AnyRun>(runId: string, erreur: string): Promise<T> {
  const run = await getRun<T>(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  const updated = { ...run, statut: 'echec', dateFin: new Date().toISOString(), erreur } as T;
  await writeRun(updated);
  return updated;
}

// Remplace `resume` sans toucher au statut/dateFin — utilisé pour rafraîchir un résultat qui
// évolue de façon asynchrone côté Salesforce après la fin de notre propre run (ex. le job Bulk API
// d'un push continue de traiter les enregistrements après qu'on l'a soumis).
export async function patchRunResume<T extends AnyRun>(runId: string, resume: T['resume']): Promise<T> {
  const run = await getRun<T>(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  const updated = { ...run, resume } as T;
  await writeRun(updated);
  return updated;
}

export async function getRun<T extends AnyRun = AnyRun>(runId: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(runJsonPath(runId), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function listRuns<T extends AnyRun = AnyRun>(type: RunType): Promise<T[]> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
  const runs: T[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const run = await getRun<T>(entry.name);
    if (run && run.type === type) {
      runs.push(run);
    }
  }
  return runs.sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));
}

export async function hasRunInProgress(type: RunType): Promise<boolean> {
  const runs = await listRuns(type);
  return runs.some((run) => run.statut === 'en_cours');
}

export async function deleteRun(runId: string): Promise<void> {
  await fs.rm(runDir(runId), { recursive: true, force: true });
}

export function outputFilePath(runId: string, fichier: string): string {
  return path.join(runDir(runId), 'output', fichier);
}

export async function readRunOutputFile(runId: string, fichier: string): Promise<string> {
  return fs.readFile(outputFilePath(runId, fichier), 'utf-8');
}

export async function writeRunOutputFile(runId: string, fichier: string, content: string): Promise<void> {
  await fs.writeFile(outputFilePath(runId, fichier), content, 'utf-8');
}
