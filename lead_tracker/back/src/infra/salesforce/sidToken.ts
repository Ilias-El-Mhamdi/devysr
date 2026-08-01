// Le sid (cookie de session UI) fonctionne aussi comme access token pour l'API REST Salesforce.
export function toBearerToken(sidCookie: string): string {
  return sidCookie.startsWith('sid=') ? sidCookie.slice('sid='.length) : sidCookie;
}
