import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpscanRun } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchUpscanRuns(): Promise<UpscanRun[]> {
  const res = await fetch('/api/runs?type=upscan');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load upscans: ${res.status}`));
  }
  return (await res.json()) as UpscanRun[];
}

export function useUpscanRuns() {
  return useQuery({
    queryKey: ['upscan-runs'],
    queryFn: fetchUpscanRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startUpscan(): Promise<{ runId: string }> {
  const res = await fetch('/api/upscan', { method: 'POST' });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start upscan: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartUpscan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startUpscan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['upscan-runs'] });
    },
  });
}
