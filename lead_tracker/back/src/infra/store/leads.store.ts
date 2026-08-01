import path from 'node:path';
import fs from 'node:fs/promises';
import type { LeadRecord } from 'shared/types/lead';

const LEADS_PATH = path.resolve(__dirname, '../../../data/leads.json');
const HISTORIQUE_PATH = path.resolve(__dirname, '../../../data/leads_historique.jsonl');

async function readAll(): Promise<Record<string, LeadRecord>> {
  try {
    const raw = await fs.readFile(LEADS_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, LeadRecord>;
  } catch {
    return {};
  }
}

async function writeAll(leads: Record<string, LeadRecord>): Promise<void> {
  await fs.mkdir(path.dirname(LEADS_PATH), { recursive: true });
  await fs.writeFile(LEADS_PATH, JSON.stringify(leads, null, 2), 'utf-8');
}

export async function getAllLeads(): Promise<Record<string, LeadRecord>> {
  return readAll();
}

export interface ChampChange {
  champ: string;
  avant: string | null;
  apres: string;
}

// Seul lecteur/écrivain de leads.json et leads_historique.jsonl (cf. CLAUDE.md § Stockage local).
// `changements` est calculé par le usecase (diff avant/après) ; append-only sur l'historique, une
// ligne par changement de champ, jamais réécrit.
export async function upsertLead(lead: LeadRecord, changements: ChampChange[]): Promise<void> {
  const leads = await readAll();
  leads[lead.id] = lead;
  await writeAll(leads);

  if (changements.length === 0) {
    return;
  }
  await fs.mkdir(path.dirname(HISTORIQUE_PATH), { recursive: true });
  const date = new Date().toISOString();
  const lines = changements.map((changement) => `${JSON.stringify({ leadId: lead.id, ...changement, date })}\n`).join('');
  await fs.appendFile(HISTORIQUE_PATH, lines, 'utf-8');
}
