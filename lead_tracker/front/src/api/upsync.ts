import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpsyncRun } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchUpsyncRuns(): Promise<UpsyncRun[]> {
  const res = await fetch('/api/runs?type=upsync');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load upsyncs: ${res.status}`));
  }
  return (await res.json()) as UpsyncRun[];
}

export function useUpsyncRuns() {
  return useQuery({
    queryKey: ['upsync-runs'],
    queryFn: fetchUpsyncRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startUpsync(): Promise<{ runId: string }> {
  const res = await fetch('/api/upsync', { method: 'POST' });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start upsync: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartUpsync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startUpsync,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['upsync-runs'] });
    },
  });
}
