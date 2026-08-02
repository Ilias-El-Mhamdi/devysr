import puppeteer, { type Browser, type Cookie, type Page } from 'puppeteer-core';
import { config } from '../../config';

export const FIREFOX_CONNECTION_ERROR =
  'Could not connect to Firefox. Make sure the app is running (npm run start) and the dedicated Firefox window is open.';

// Connexion + onglet dédié tenus en mémoire pour la durée du process back plutôt que
// reconnectés à chaque appel : Salesforce redirige automatiquement tout onglet posé sur
// instanceHost (my.salesforce.com) vers Lightning puis ailleurs (vérifié empiriquement), donc le
// retrouver par URL après coup échoue. En le gardant en mémoire (référence directe), on peut le
// re-naviguer sur instanceHost à chaque lecture sans jamais ouvrir de nouvel onglet.
let browserConnection: Browser | null = null;
let sessionPage: Page | null = null;

// L'endpoint WebDriver BiDi de Firefox est déterministe (ws://127.0.0.1:<port>, pas de token
// aléatoire comme le /json/version de Chrome) tant qu'on fixe nous-mêmes le port via
// --remote-debugging-port (cf. openBrowser.ts) — vérifié empiriquement, pas besoin de le découvrir
// dynamiquement.
async function getBrowserConnection(): Promise<Browser> {
  if (browserConnection?.connected) {
    return browserConnection;
  }
  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint: `ws://127.0.0.1:${config.firefox.debugPort}/session`,
      protocol: 'webDriverBiDi',
    });
    browser.once('disconnected', () => {
      browserConnection = null;
      sessionPage = null;
    });
    browserConnection = browser;
    return browser;
  } catch {
    throw new Error(FIREFOX_CONNECTION_ERROR);
  }
}

async function getSessionPage(): Promise<Page> {
  const browser = await getBrowserConnection();
  if (sessionPage && !sessionPage.isClosed()) {
    return sessionPage;
  }
  sessionPage = await browser.newPage();
  return sessionPage;
}

// Lit les cookies Salesforce depuis le profil du Firefox dédié, sans naviguer ni piloter de
// login — la session est déjà là si l'utilisateur s'est loggé une fois dans cette fenêtre (cf.
// features/exportLeads.md § Récupération des données).
//
// Firefox partitionne le stockage par site de premier niveau (Total Cookie Protection),
// contrairement à Chrome où les cookies étaient lisibles depuis n'importe quel onglet. Le `sid`
// utilisable comme Bearer token pour l'API REST vit dans la partition `instanceHost`
// (my.salesforce.com) — vérifié empiriquement : le `sid` visible depuis l'onglet Lightning
// (lightning.force.com) est un cookie *différent*, invalide pour l'API (401 INVALID_SESSION_ID).
// D'où la re-navigation sur instanceHost ci-dessous, sur l'onglet dédié (jamais l'onglet
// dashboard existant, qu'on ne doit jamais rediriger) — on lit les cookies juste après le
// chargement, avant que Salesforce ne redirige vers Lightning.
async function getSalesforceCookies(): Promise<Cookie[]> {
  const page = await getSessionPage();
  await page.goto(`https://${config.salesforce.instanceHost}/`, { waitUntil: 'domcontentloaded' });
  return await page.cookies();
}

// Le sid seul suffit pour l'authentification Bearer sur l'API REST (cf. sessionCheck.ts et
// reportDescribe.ts) — pas besoin du reste du cookie jar, l'API REST n'est pas la session UI.
export async function getSalesforceSessionCookie(): Promise<string | null> {
  const cookies = await getSalesforceCookies();
  const sid = cookies.find((cookie) => cookie.name === 'sid');
  return sid ? `${sid.name}=${sid.value}` : null;
}
