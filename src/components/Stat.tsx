interface Props {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

const tones: Record<NonNullable<Props['tone']>, string> = {
  neutral: 'text-slate-900',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
};

export default function Stat({ label, value, note, tone = 'neutral' }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`tnum mt-2 text-2xl font-semibold tracking-tight ${tones[tone]}`}>{value}</p>
      {note && <p className="mt-1 text-xs leading-snug text-slate-500">{note}</p>}
    </div>
  );
}
