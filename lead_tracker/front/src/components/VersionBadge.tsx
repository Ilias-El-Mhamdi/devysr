import { useVersion } from '../api/version';

export function VersionBadge() {
  const { data: version } = useVersion();

  if (!version) {
    return null;
  }

  return <div className="fixed right-3 bottom-3 z-10 text-xs text-white/30 select-none">v{version}</div>;
}
