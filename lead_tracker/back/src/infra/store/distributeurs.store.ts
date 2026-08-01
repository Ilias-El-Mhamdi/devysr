import path from 'node:path';
import fs from 'node:fs/promises';
import type { Distributeur } from 'shared/types/distributeur';

const DISTRIBUTEURS_PATH = path.resolve(__dirname, '../../../data/distributeurs.json');

async function readAll(): Promise<Record<string, Distributeur>> {
  try {
    const raw = await fs.readFile(DISTRIBUTEURS_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, Distributeur>;
  } catch {
    return {};
  }
}

export async function getAllDistributeurs(): Promise<Record<string, Distributeur>> {
  return readAll();
}

export async function saveDistributeur(distributeur: Distributeur): Promise<void> {
  const distributeurs = await readAll();
  distributeurs[distributeur.nom] = distributeur;
  await fs.mkdir(path.dirname(DISTRIBUTEURS_PATH), { recursive: true });
  await fs.writeFile(DISTRIBUTEURS_PATH, JSON.stringify(distributeurs, null, 2), 'utf-8');
}
