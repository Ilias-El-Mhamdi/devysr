import { useQuery } from '@tanstack/react-query';
import type { HelloResponse } from 'shared/types/hello';

async function fetchHello(): Promise<HelloResponse> {
  const res = await fetch('/api/hello');
  if (!res.ok) {
    throw new Error(`Hello request failed: ${res.status}`);
  }
  return (await res.json()) as HelloResponse;
}

export function useHello() {
  return useQuery({ queryKey: ['hello'], queryFn: fetchHello, retry: false });
}
