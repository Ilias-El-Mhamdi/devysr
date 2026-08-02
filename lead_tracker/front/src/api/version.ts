import { useQuery } from '@tanstack/react-query';

async function fetchVersion(): Promise<string> {
  const res = await fetch('/api/version');
  if (!res.ok) {
    throw new Error(`Failed to load version: ${res.status}`);
  }
  const data = (await res.json()) as { version: string };
  return data.version;
}

export function useVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: fetchVersion,
    staleTime: Infinity,
  });
}
