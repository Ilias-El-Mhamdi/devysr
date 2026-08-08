import { useQuery } from '@tanstack/react-query';
import type { StatsResponse } from 'shared/types/stats';

async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/api/stats');
  if (!res.ok) {
    throw new Error(`Failed to load stats: ${res.status}`);
  }
  return (await res.json()) as StatsResponse;
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });
}
