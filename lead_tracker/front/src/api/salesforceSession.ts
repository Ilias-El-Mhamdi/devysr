import { useQuery } from '@tanstack/react-query';
import type { SalesforceSessionCheckResponse } from 'shared/types/salesforceSession';

const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

async function checkSalesforceSession(): Promise<SalesforceSessionCheckResponse> {
  const res = await fetch('/api/salesforce/session/check', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Vérification de session échouée: ${res.status}`);
  }
  return (await res.json()) as SalesforceSessionCheckResponse;
}

// Boucle de keep-alive pilotée par le front : tant que ce hook est monté (donc tant que l'app est
// ouverte), la session Salesforce est re-vérifiée toutes les 10 min — cf. features/exportLeads.md.
export function useSalesforceSession() {
  return useQuery({
    queryKey: ['salesforce-session'],
    queryFn: checkSalesforceSession,
    refetchInterval: KEEP_ALIVE_INTERVAL_MS,
    retry: false,
  });
}
