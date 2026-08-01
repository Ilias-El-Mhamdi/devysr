import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImportRun } from 'shared/types/run';
import { readErrorMessage } from './runs';

async function fetchImportRuns(): Promise<ImportRun[]> {
  const res = await fetch('/api/runs?type=import');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to load imports: ${res.status}`));
  }
  return (await res.json()) as ImportRun[];
}

export function useImportRuns() {
  return useQuery({
    queryKey: ['import-runs'],
    queryFn: fetchImportRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startImport(exportRunId: string): Promise<{ runId: string }> {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exportRunId }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Failed to start import: ${res.status}`));
  }
  return (await res.json()) as { runId: string };
}

export function useStartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startImport,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['import-runs'] });
    },
  });
}
