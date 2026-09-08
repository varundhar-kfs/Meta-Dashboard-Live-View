/** Utilisation as a bar. Amber past 70%, red past 85% — the pause-risk zone. */
export default function Bar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-600">—</span>;
  const v = Math.max(0, Math.min(1, value));
  const tone = v > 0.85 ? 'bg-bad' : v > 0.7 ? 'bg-warn' : 'bg-ok';
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${v * 100}%` }} />
      </div>
      <span
        className={`tnum w-10 text-right text-xs font-semibold ${
          v > 0.85 ? 'text-bad' : v > 0.7 ? 'text-warn' : 'text-ink-200'
        }`}
      >
        {(v * 100).toFixed(0)}%
      </span>
    </div>
  );
}
