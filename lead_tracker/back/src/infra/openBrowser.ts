import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { config } from '../config';
import { DATA_DIR } from '../paths';

function findFirefoxExecutable(): string {
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Firefox.app/Contents/MacOS/firefox';
    case 'win32':
      return 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
    default:
      return 'firefox';
  }
}

// spawn() sur le binaire directement ne déclenche pas l'activation standard de l'app (contrairement
// à un lancement depuis le Dock/Finder) : la fenêtre s'ouvre mais reste en arrière-plan derrière le
// terminal qui a lancé le back. On force l'activation explicitement après coup.
function focusFirefox(): void {
  switch (process.platform) {
    case 'darwin':
      spawn('osascript', ['-e', 'tell application "Firefox" to activate'], { detached: true, stdio: 'ignore' }).unref();
      break;
    case 'win32':
      spawn('powershell', ['-NoProfile', '-Command', "(New-Object -ComObject WScript.Shell).AppActivate('Mozilla Firefox')"], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      break;
  }
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1', timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Point unique d'accès au navigateur : le Firefox dédié (profil isolé) affiche le dashboard ET
// sert de session Salesforce loggée pour Puppeteer (connecté en WebDriver BiDi, cf.
// puppeteerSession.ts) — un seul navigateur, plus de Chrome nulle part dans l'app.
//
// Si un Firefox dédié tourne déjà (relance de l'app sans avoir quitté Firefox), on ne relance pas
// un process par-dessus : ça a déjà causé une accumulation d'onglets dupliqués avec l'ancien
// Chrome dédié, et un second process sur le même profil Firefox se refuserait de toute façon à
// démarrer.
export async function launchDedicatedFirefox(url: string): Promise<void> {
  if (await isPortOpen(config.firefox.debugPort)) {
    focusFirefox();
    return;
  }

  const userDataDir = config.firefox.userDataDir ?? path.join(DATA_DIR, 'firefox-profile');

  const args = ['--profile', userDataDir, `--remote-debugging-port=${config.firefox.debugPort}`, url];

  const child = spawn(findFirefoxExecutable(), args, { detached: true, stdio: 'ignore' });

  // Laisse le temps à la fenêtre d'apparaître avant de tenter de l'activer.
  setTimeout(focusFirefox, 1500);

  child.unref();
}
