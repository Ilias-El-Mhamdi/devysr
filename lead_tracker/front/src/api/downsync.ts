import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DownsyncRun } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchDownsyncRuns(): Promise<DownsyncRun[]> {
  const res = await fetch('/api/runs?type=downsync');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load downsyncs: ${res.status}`));
  }
  return (await res.json()) as DownsyncRun[];
}

export function useDownsyncRuns() {
  return useQuery({
    queryKey: ['downsync-runs'],
    queryFn: fetchDownsyncRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startDownsync(nouveauxUniquement: boolean): Promise<{ runId: string }> {
  const res = await fetch('/api/downsync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nouveauxUniquement }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start downsync: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartDownsync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startDownsync,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['downsync-runs'] });
    },
  });
}
