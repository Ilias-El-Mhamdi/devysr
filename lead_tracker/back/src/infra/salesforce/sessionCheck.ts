import { config } from '../../config';
import { toBearerToken } from './sidToken';

export async function pingSalesforceSession(cookie: string): Promise<boolean> {
  const response = await fetch(`https://${config.salesforce.instanceHost}/services/data/v61.0/limits`, {
    headers: { Authorization: `Bearer ${toBearerToken(cookie)}` },
  });
  return response.ok;
}
