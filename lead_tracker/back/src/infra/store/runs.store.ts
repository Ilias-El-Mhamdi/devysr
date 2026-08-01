import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ExportRunInput, Run, RunResume, RunType } from 'shared/types/run';

const RUNS_DIR = path.resolve(__dirname, '../../../data/runs');

function runDir(runId: string): string {
  return path.join(RUNS_DIR, runId);
}

function runJsonPath(runId: string): string {
  return path.join(runDir(runId), 'run.json');
}

async function writeRun(run: Run): Promise<void> {
  await fs.writeFile(runJsonPath(run.id), JSON.stringify(run, null, 2), 'utf-8');
}

export async function createRun(type: RunType, input: ExportRunInput): Promise<Run> {
  const id = randomUUID();
  await fs.mkdir(path.join(runDir(id), 'input'), { recursive: true });
  await fs.mkdir(path.join(runDir(id), 'output'), { recursive: true });
  await fs.writeFile(path.join(runDir(id), 'input', 'request.json'), JSON.stringify(input, null, 2), 'utf-8');

  const run: Run = {
    id,
    type,
    statut: 'en_cours',
    dateDebut: new Date().toISOString(),
    dateFin: null,
    resume: null,
    input,
    output: { fichier: null },
    erreur: null,
  };
  await writeRun(run);
  return run;
}

export async function completeRun(runId: string, resume: RunResume, fichier: string): Promise<Run> {
  const run = await getRun(runId);
  if (!run) {
    throw new Error(`Run introuvable: ${runId}`);
  }
  const updated: Run = { ...run, statut: 'succes', dateFin: new Date().toISOString(), resume, output: { fichier } };
  await writeRun(updated);
  return updated;
}

export async function failRun(runId: string, erreur: string): Promise<Run> {
  const run = await getRun(runId);
  if (!run) {
    throw new Error(`Run introuvable: ${runId}`);
  }
  const updated: Run = { ...run, statut: 'echec', dateFin: new Date().toISOString(), erreur };
  await writeRun(updated);
  return updated;
}

export async function getRun(runId: string): Promise<Run | null> {
  try {
    const raw = await fs.readFile(runJsonPath(runId), 'utf-8');
    return JSON.parse(raw) as Run;
  } catch {
    return null;
  }
}

export async function listRuns(type: RunType): Promise<Run[]> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
  const runs: Run[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const run = await getRun(entry.name);
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
