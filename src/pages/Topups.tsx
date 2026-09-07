import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Upload } from 'lucide-react';
import { api, inr, pct, type Topup, type TopupState } from '../lib/api';

const STATE_STYLE: Record<TopupState, string> = {
  PAID_UNVERIFIED: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-sky-100 text-sky-800',
  LOADING: 'bg-slate-200 text-slate-700',
  LOADED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  MANUAL_REVIEW: 'bg-red-100 text-red-800',
};

export default function Topups() {
  const qc = useQueryClient();
  const list = useQuery<Topup[]>({ queryKey: ['topups'], queryFn: () => api.get('/api/topups') });

  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/api/topups/${id}/verify`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topups'] }),
  });
  const load = useMutation({
    mutationFn: (id: string) => api.post(`/api/topups/${id}/load`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topups'] }),
  });

  const rows = list.data ?? [];
  const awaiting = rows.filter((r) => r.state === 'PAID_UNVERIFIED');
  const ready = rows.filter((r) => r.state === 'VERIFIED');
  const stuck = rows.filter((r) => r.state === 'MANUAL_REVIEW' || r.state === 'FAILED');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Awaiting verification" n={awaiting.length}
              sum={awaiting.reduce((a, r) => a + r.paid, 0)} tone="amber" />
        <Tile label="Verified — ready to load" n={ready.length}
              sum={ready.reduce((a, r) => a + (r.spendToLoad ?? 0), 0)} tone="sky" />
        <Tile label="Needs a human" n={stuck.length}
              sum={stuck.reduce((a, r) => a + r.paid, 0)} tone="red" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Top-up queue</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              A payment is never loaded automatically. Accounts confirms the money first — that
              control is what makes the write safe.
            </p>
          </div>
          {list.isFetching && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <Upload size={20} className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-medium">Nothing in the queue</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Top-ups arrive from the gateway webhook at{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                /api/webhook/easebuzz/payment
              </code>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 font-medium">Brand</th>
                  <th className="px-4 py-2 text-right font-medium">Paid</th>
                  <th className="px-4 py-2 text-right font-medium">Fee</th>
                  <th className="px-4 py-2 text-right font-medium">To load</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.topupId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.brandId ?? '—'}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.ref}</div>
                    </td>
                    <td className="tnum px-4 py-2 text-right">{inr(r.paid)}</td>
                    <td className="tnum px-4 py-2 text-right text-slate-500">
                      {inr(r.fee)} {r.feeRate != null && <span className="text-slate-400">({pct(r.feeRate, 2)})</span>}
                    </td>
                    <td className="tnum px-4 py-2 text-right font-medium">{inr(r.spendToLoad)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${STATE_STYLE[r.state]}`}>
                        {r.state.replace(/_/g, ' ')}
                      </span>
                      {r.notes?.length ? (
                        <div className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-red-700">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                          <span>{r.notes.join('; ')}</span>
                        </div>
                      ) : null}
                      {r.lastError && (
                        <div className="mt-1 text-[11px] leading-snug text-red-700">{r.lastError}</div>
                      )}
                      {r.state === 'LOADED' && r.capBefore != null && (
                        <div className="tnum mt-1 text-[11px] text-slate-500">
                          cap {inr(r.capBefore)} → {inr(r.capAfter)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.state === 'PAID_UNVERIFIED' && (
                        <button
                          onClick={() => verify.mutate(r.topupId)}
                          disabled={verify.isPending}
                          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          Confirm received
                        </button>
                      )}
                      {r.state === 'VERIFIED' && (
                        <button
                          onClick={() => load.mutate(r.topupId)}
                          disabled={load.isPending}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <Check size={12} /> Load wallet
                        </button>
                      )}
                      {r.state === 'FAILED' && (
                        <button
                          onClick={() => load.mutate(r.topupId)}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, n, sum, tone }: { label: string; n: number; sum: number; tone: 'amber' | 'sky' | 'red' }) {
  const ring = { amber: 'border-amber-200 bg-amber-50', sky: 'border-sky-200 bg-sky-50', red: 'border-red-200 bg-red-50' }[tone];
  return (
    <div className={`rounded-lg border p-4 ${ring}`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="tnum mt-1.5 text-2xl font-semibold">{n}</p>
      <p className="tnum mt-0.5 text-xs text-slate-600">{inr(sum)}</p>
    </div>
  );
}
