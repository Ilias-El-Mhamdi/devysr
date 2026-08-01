import { config } from '../../config';

// Le sid (cookie de session UI) fonctionne aussi comme access token pour l'API REST Salesforce —
// on l'utilise pour un ping léger plutôt que de renaviguer vers l'UI.
export async function pingSalesforceSession(cookie: string): Promise<boolean> {
  const sid = cookie.startsWith('sid=') ? cookie.slice('sid='.length) : cookie;
  const response = await fetch(`https://${config.salesforce.instanceHost}/services/data/v61.0/limits`, {
    headers: { Authorization: `Bearer ${sid}` },
  });
  return response.ok;
}
