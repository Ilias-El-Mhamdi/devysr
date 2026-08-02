import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_DIR } from '../../paths';

const OBSERVABILITY_DIR = path.join(DATA_DIR, 'observability');

interface Activity {
  nomActivite: string;
  nbLead?: number;
  nbDistributeur?: number;
  date: string;
}

export async function logActivity(activity: Activity): Promise<void> {
  await fs.mkdir(OBSERVABILITY_DIR, { recursive: true });
  await fs.appendFile(path.join(OBSERVABILITY_DIR, 'activities.jsonl'), JSON.stringify(activity) + '\n', 'utf-8');
}
