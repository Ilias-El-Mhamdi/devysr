import puppeteer, { type Browser, type Cookie } from 'puppeteer-core';
import { config } from '../../config';

export const CHROME_CONNECTION_ERROR =
  "Impossible de se connecter à Chrome. Vérifie que l'outil est bien lancé (npm run start) et que la fenêtre Chrome dédiée est ouverte.";

async function connect(): Promise<Browser> {
  try {
    return await puppeteer.connect({ browserURL: `http://127.0.0.1:${config.chrome.debugPort}` });
  } catch {
    throw new Error(CHROME_CONNECTION_ERROR);
  }
}

// Lit les cookies Salesforce directement depuis le profil du Chrome dédié, sans naviguer ni
// piloter de login — les cookies sont déjà là si l'utilisateur s'est loggé une fois dans cette
// fenêtre (cf. features/exportLeads.md § Récupération des données).
async function getSalesforceCookies(): Promise<Cookie[]> {
  const browser = await connect();
  let createdPage = false;
  try {
    const pages = await browser.pages();
    let page = pages[0];
    if (!page) {
      page = await browser.newPage();
      createdPage = true;
    }
    const cookies = await page.cookies(`https://${config.salesforce.instanceHost}`);
    if (createdPage) {
      await page.close();
    }
    return cookies;
  } finally {
    await browser.disconnect();
  }
}

// Le sid seul suffit pour l'authentification Bearer sur l'API REST (cf. sessionCheck.ts et
// reportDescribe.ts) — pas besoin du reste du cookie jar, l'API REST n'est pas la session UI.
export async function getSalesforceSessionCookie(): Promise<string | null> {
  const cookies = await getSalesforceCookies();
  const sid = cookies.find((cookie) => cookie.name === 'sid');
  return sid ? `${sid.name}=${sid.value}` : null;
}
