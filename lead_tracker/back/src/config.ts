import pkg from '../package.json';

export const config = {
  // Version affichée dans le front (cf. /api/version) — mise à jour par scripts/release.sh à
  // chaque package, source unique de vérité pour la version livrée.
  version: pkg.version,
  salesforce: {
    reportId: process.env.SALESFORCE_REPORT_ID ?? '00Ofj00000FxuDdEAJ',
    instanceHost: process.env.SALESFORCE_INSTANCE_HOST ?? 'orgfarm-fec657de9c-dev-ed.develop.my.salesforce.com',
    reportUrl:
      process.env.SALESFORCE_REPORT_URL ?? 'https://orgfarm-fec657de9c-dev-ed.develop.lightning.force.com/lightning/r/Report/00Ofj00000FxuDdEAJ/edit',
  },
  chrome: {
    debugPort: Number(process.env.CHROME_DEBUG_PORT ?? 9222),
    userDataDir: process.env.CHROME_USER_DATA_DIR,
  },
  storage: {
    // Racine du stockage local (leads.json, distributeurs.json, runs/, observability/). Par
    // défaut à côté de back/ et front/ (cf. paths.ts) pour qu'un redéploiement du back (dist/
    // + node_modules) n'écrase jamais les données — sans cette variable, on retombe sur ce
    // défaut.
    dataDir: process.env.DATA_DIR,
    // Chemin absolu vers le dossier des fichiers Excel distributeurs. Ce dossier vit sur un
    // partage réseau (pas dans le repo) : sans cette variable, on retombe sur data/distributeurs
    // en local (pratique en dev, mais pas la config utilisée en prod).
    distributorsDir: process.env.DISTRIBUTORS_DIR,
  },
};
