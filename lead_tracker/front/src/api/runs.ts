import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ApiErrorBody {
  message?: string;
}

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.message ?? fallback;
}

async function deleteRun(runId: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Suppression échouée: ${res.status}`));
  }
}

// Générique : DELETE /api/runs/:id fonctionne pareil pour un run d'export ou d'import — seule la
// query à invalider diffère selon la section qui l'utilise.
export function useDeleteRun(queryKey: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function runDownloadUrl(runId: string): string {
  return `/api/runs/${runId}/download`;
}
