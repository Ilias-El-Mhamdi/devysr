import puppeteer, { type Browser } from 'puppeteer-core';
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

// Lit le cookie de session Salesforce (`sid`) directement depuis le profil du Chrome dédié, sans
// naviguer ni piloter de login — le cookie est déjà là si l'utilisateur s'est loggé une fois dans
// cette fenêtre (cf. features/exportLeads.md § Récupération des données).
export async function getSalesforceSessionCookie(): Promise<string | null> {
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
    const sid = cookies.find((cookie) => cookie.name === 'sid');
    if (createdPage) {
      await page.close();
    }
    return sid ? `${sid.name}=${sid.value}` : null;
  } finally {
    await browser.disconnect();
  }
}
