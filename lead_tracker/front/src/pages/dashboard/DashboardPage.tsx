import { useState } from 'react';
import type { DownsyncRun, UpsyncRun } from 'shared/types/run';
import { useDownsyncRuns, useStartDownsync } from '../../api/downsync';
import { useUpsyncRuns, useStartUpsync } from '../../api/upsync';
import { DownsyncRunCard } from '../../components/DownsyncRunCard';
import { UpsyncRunCard } from '../../components/UpsyncRunCard';
import { toast } from '../../lib/toast';

// Runs déclenchés depuis CE montage de la page — pas persisté : un reload ou une navigation vers
// une autre page démonte le composant et vide cet état. L'historique complet, lui, reste
// consultable sans limite de session sur /history (cf. HistoryPage).
type SessionEntry = { kind: 'downsync'; id: string } | { kind: 'upsync'; id: string };

export function DashboardPage() {
  const { data: downsyncRuns } = useDownsyncRuns();
  const startDownsync = useStartDownsync();

  const { data: upsyncRuns } = useUpsyncRuns();
  const startUpsync = useStartUpsync();

  const [sessionRuns, setSessionRuns] = useState<SessionEntry[]>([]);

  const hasDownsyncInProgress = downsyncRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const hasUpsyncInProgress = upsyncRuns?.some((run) => run.statut === 'en_cours') ?? false;
  const isAnySyncRunning = hasDownsyncInProgress || hasUpsyncInProgress || startDownsync.isPending || startUpsync.isPending;

  const handleStartDownsync = () => {
    startDownsync.mutate(false, {
      onSuccess: ({ runId }) => setSessionRuns((prev) => [{ kind: 'downsync', id: runId }, ...prev]),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Downsync failed to start.'),
    });
  };

  const handleStartUpsync = () => {
    startUpsync.mutate(undefined, {
      onSuccess: ({ runId }) => setSessionRuns((prev) => [{ kind: 'upsync', id: runId }, ...prev]),
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Upsync failed to start.'),
    });
  };

  function findRun(entry: SessionEntry): DownsyncRun | UpsyncRun | undefined {
    return entry.kind === 'downsync' ? downsyncRuns?.find((run) => run.id === entry.id) : upsyncRuns?.find((run) => run.id === entry.id);
  }

  const sessionRunsWithData = sessionRuns
    .map((entry) => ({ entry, run: findRun(entry) }))
    .filter((item): item is { entry: SessionEntry; run: DownsyncRun | UpsyncRun } => item.run !== undefined);

  const inProgress = sessionRunsWithData.filter(({ run }) => run.statut === 'en_cours');
  const history = sessionRunsWithData.filter(({ run }) => run.statut !== 'en_cours');

  return (
    <main className="min-h-screen px-6 py-12 sm:px-10 lg:px-16">
      <header className="glass-panel glow-cyan rounded-2xl px-8 py-7">
        <div className="flex items-center justify-center gap-4">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-neon-cyan/60 sm:w-20" />
          <h1 className="font-mono-display text-xl font-semibold tracking-[0.35em] text-slate-100 uppercase sm:text-2xl">
            Devysr <span className="text-neon-cyan">Lead Tracker</span>
          </h1>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-neon-cyan/60 sm:w-20" />
        </div>
      </header>

      <section className="mt-8 px-8 py-14">
        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-8">
          <button
            type="button"
            onClick={handleStartDownsync}
            disabled={isAnySyncRunning}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-neon-cyan/30 bg-slate-950/60 px-16 py-9 font-mono-display text-lg font-semibold tracking-[0.2em] text-neon-cyan uppercase transition duration-200 hover:border-neon-cyan hover:bg-neon-cyan/5 hover:shadow-[0_0_30px_-6px_rgba(34,211,238,0.5)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-neon-cyan/30 disabled:hover:bg-slate-950/60 disabled:hover:shadow-none"
          >
            <span className="absolute top-0 left-0 h-3 w-3 border-t border-l border-neon-cyan/70" />
            <span className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-neon-cyan/70" />
            {hasDownsyncInProgress ? 'Down Sync…' : 'Down Sync'}
          </button>

          <button
            type="button"
            onClick={handleStartUpsync}
            disabled={isAnySyncRunning}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-neon-violet/30 bg-slate-950/60 px-16 py-9 font-mono-display text-lg font-semibold tracking-[0.2em] text-neon-violet uppercase transition duration-200 hover:border-neon-violet hover:bg-neon-violet/5 hover:shadow-[0_0_30px_-6px_rgba(168,85,247,0.5)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-neon-violet/30 disabled:hover:bg-slate-950/60 disabled:hover:shadow-none"
          >
            <span className="absolute top-0 left-0 h-3 w-3 border-t border-l border-neon-violet/70" />
            <span className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-neon-violet/70" />
            {hasUpsyncInProgress ? 'Up Sync…' : 'Up Sync'}
          </button>
        </div>
      </section>

      {inProgress.length > 0 && (
        <section className="glass-panel glow-violet mt-8 rounded-2xl px-8 py-6">
          <h2 className="text-lg font-semibold text-slate-100">In progress</h2>

          <div className="mt-6 flex flex-col gap-4">
            {inProgress.map(({ entry, run }) =>
              entry.kind === 'downsync' ? <DownsyncRunCard key={entry.id} run={run as DownsyncRun} /> : <UpsyncRunCard key={entry.id} run={run as UpsyncRun} />,
            )}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="glass-panel glow-cyan mt-8 rounded-2xl px-8 py-6">
          <h2 className="text-lg font-semibold text-slate-100">History</h2>

          <div className="mt-6 flex flex-col gap-4">
            {history.map(({ entry, run }) =>
              entry.kind === 'downsync' ? <DownsyncRunCard key={entry.id} run={run as DownsyncRun} /> : <UpsyncRunCard key={entry.id} run={run as UpsyncRun} />,
            )}
          </div>
        </section>
      )}
    </main>
  );
}
