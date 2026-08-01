import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Run } from 'shared/types/run';

interface ApiErrorBody {
  message?: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.message ?? fallback;
}

async function fetchExportRuns(): Promise<Run[]> {
  const res = await fetch('/api/runs?type=export');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Chargement des exports échoué: ${res.status}`));
  }
  return (await res.json()) as Run[];
}

export function useExportRuns() {
  return useQuery({
    queryKey: ['export-runs'],
    queryFn: fetchExportRuns,
    refetchInterval: (query) => (query.state.data?.some((run) => run.statut === 'en_cours') ? 3000 : false),
  });
}

async function startExport(): Promise<{ runId: string }> {
  const res = await fetch('/api/export', { method: 'POST' });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Lancement de l'export échoué: ${res.status}`));
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

async function deleteExportRun(runId: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Suppression échouée: ${res.status}`));
  }
}

export function useDeleteExportRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteExportRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['export-runs'] });
    },
  });
}

export function exportDownloadUrl(runId: string): string {
  return `/api/runs/${runId}/download`;
}
