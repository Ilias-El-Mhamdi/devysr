interface StatCardProps {
  label: string;
  value: string;
  accent?: 'cyan' | 'violet' | 'green' | 'red' | 'amber';
}

const ACCENT_TEXT: Record<NonNullable<StatCardProps['accent']>, string> = {
  cyan: 'text-neon-cyan',
  violet: 'text-neon-violet',
  green: 'text-neon-green',
  red: 'text-neon-red',
  amber: 'text-neon-amber',
};

export function StatCard({ label, value, accent = 'cyan' }: StatCardProps) {
  return (
    <div className="glass-panel rounded-xl px-5 py-4">
      <p className="font-mono-display text-[0.65rem] tracking-[0.25em] text-slate-500 uppercase">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${ACCENT_TEXT[accent]}`}>{value}</p>
    </div>
  );
}
