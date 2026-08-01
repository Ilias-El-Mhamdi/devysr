import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExportRun } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchExportRuns(): Promise<ExportRun[]> {
  const res = await fetch('/api/runs?type=export');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load exports: ${res.status}`));
  }
  return (await res.json()) as ExportRun[];
}

export function useExportRuns() {
  return useQuery({
    queryKey: ['export-runs'],
    queryFn: fetchExportRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startExport(nouveauxUniquement: boolean): Promise<{ runId: string }> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nouveauxUniquement }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start export: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startExport,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['export-runs'] });
    },
  });
}
