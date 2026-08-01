import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config';

function findChromeExecutable(): string {
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'win32':
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default:
      return 'google-chrome';
  }
}

// Lance un Chrome dédié à l'outil (profil isolé), avec le CDP (Chrome DevTools Protocol) exposé.
// Un Chrome lancé normalement n'expose pas CDP : le flag doit être présent au lancement du
// process, on ne peut pas se greffer après coup sur une instance déjà ouverte sans ce flag.
// C'est ce même Chrome que l'utilisateur garde ouvert pour le dashboard ET pour se logger à
// Salesforce (cf. features/exportLeads.md).
export function launchDedicatedChrome(url: string): void {
  const userDataDir = config.chrome.userDataDir ?? path.resolve(__dirname, '../../data/chrome-profile');

  const args = [
    `--remote-debugging-port=${config.chrome.debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    // --start-maximized est ignoré par Chromium sur macOS : --window-size sert de repli fiable
    // sur toutes les plateformes.
    '--start-maximized',
    '--window-position=0,0',
    '--window-size=1920,1080',
    url,
  ];

  const child = spawn(findChromeExecutable(), args, { detached: true, stdio: 'ignore' });
  child.unref();
}
