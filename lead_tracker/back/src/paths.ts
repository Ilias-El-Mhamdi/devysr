import path from 'node:path';
import { config } from './config';

// Point d'ancrage unique pour tous les chemins du projet. Centralisé ici plutôt que recalculé
// via __dirname dans chaque fichier : un build qui regroupe tout dans un seul fichier (bundle)
// ne préserve pas la profondeur de dossier d'origine de chaque module, donc __dirname y devient
// faux partout sauf ici.
export const BACK_DIR = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(BACK_DIR, '..');
// Par défaut à la racine du monorepo (à côté de back/ et front/), pas dans back/ : un
// redéploiement du back (dist/main.js + node_modules) ne doit jamais toucher aux données.
export const DATA_DIR = config.storage.dataDir ?? path.join(PROJECT_ROOT, 'data');
