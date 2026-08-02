import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VerifyRun } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchVerifyRuns(): Promise<VerifyRun[]> {
  const res = await fetch('/api/runs?type=verify');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load verifications: ${res.status}`));
  }
  return (await res.json()) as VerifyRun[];
}

export function useVerifyRuns() {
  return useQuery({
    queryKey: ['verify-runs'],
    queryFn: fetchVerifyRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startVerify(exportRunId: string): Promise<{ runId: string }> {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exportRunId }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start verify: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartVerify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startVerify,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['verify-runs'] });
    },
  });
}
