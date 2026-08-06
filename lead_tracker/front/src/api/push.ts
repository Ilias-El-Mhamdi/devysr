import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PushRun, PushRunResume } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchPushRuns(): Promise<PushRun[]> {
  const res = await fetch('/api/runs?type=push');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load pushes: ${res.status}`));
  }
  return (await res.json()) as PushRun[];
}

export function usePushRuns() {
  return useQuery({
    queryKey: ['push-runs'],
    queryFn: fetchPushRuns,
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.statut === 'en_cours' || run.resume?.etatSalesforce === 'InProgress') ? 3000 : false,
  });
}

async function startPush(upscanRunId: string): Promise<{ runId: string }> {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upscanRunId }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start push: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startPush,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['push-runs'] });
    },
  });
}

async function refreshPushStatus(pushRunId: string): Promise<PushRunResume> {
  const res = await fetch(`/api/push/${pushRunId}/refresh`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to refresh push status: ${res.status}`));
  }
  return (await res.json()) as PushRunResume;
}

export function useRefreshPushStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshPushStatus,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['push-runs'] });
    },
  });
}
