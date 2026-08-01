import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { buildApp } from './wiring';
import { openBrowser } from './infra/openBrowser';

const PORT = Number(process.env.PORT ?? 4000);

const app = buildApp();

// En prod, front/dist existe (npm run build a tourné) : le back sert directement le build.
// En dev, front/dist n'existe pas encore : c'est le Vite dev server (port 5173) qui sert le front,
// avec un proxy /api → ce serveur (cf. front/vite.config.ts).
const frontDist = path.resolve(__dirname, '../../front/dist');
const isProdServe = fs.existsSync(frontDist);

if (isProdServe) {
  app.use(express.static(frontDist));
  app.use((_req, res) => {
    res.sendFile(path.join(frontDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`lead_tracker back listening on http://localhost:${PORT}`);
  if (isProdServe) {
    openBrowser(`http://localhost:${PORT}`);
  }
});
