import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { api, cr, pct, type Brand, type Portfolio as P } from '../lib/api';
import Stat from '../components/Stat';

const TIER_COLOUR: Record<string, string> = {
  prepaid: '#2E6B4F',
  'pg-daily': '#2A5F6B',
  short: '#8A6410',
  long: '#A8481C',
  unclassified: '#94A3B8',
};

export default function Portfolio() {
  const p = useQuery<P>({ queryKey: ['portfolio'], queryFn: () => api.get('/api/portfolio') });
  const brands = useQuery<Brand[]>({ queryKey: ['brands'], queryFn: () => api.get('/api/brands') });

  if (p.isLoading) return <Loading />;
  if (p.error) return <Err msg={(p.error as Error).message} />;
  const d = p.data;
  if (!d || d.brands === 0) return <Empty />;

  const be = d.breakevenAnnualDefaultRate;
  const tierData = Object.entries(d.tiers).map(([tier, v]) => ({
    tier, spend: v.spend, brands: v.brands,
    share: d.annualSpend > 0 ? v.spend / d.annualSpend : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ad spend financed" value={cr(d.annualSpend)} note="annualised" />
        <Stat label="Programme revenue" value={cr(d.annualRevenue)} note="fee only — not spend, not GST" tone="good" />
        <Stat
          label="Peak exposure"
          value={cr(d.peakExposure)}
          note={d.exposureOverRevenue ? `${d.exposureOverRevenue.toFixed(1)}× annual revenue` : undefined}
          tone={d.exposureOverRevenue && d.exposureOverRevenue > 2 ? 'bad' : 'warn'}
        />
        <Stat
          label="Breakeven default rate"
          value={pct(be, 0)}
          note="share of at-risk merchants defaulting in a year"
          tone={be == null ? 'neutral' : be > 0.6 ? 'good' : be > 0.35 ? 'warn' : 'bad'}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Spend by risk tier</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Prepaid and PG-settled carry little or no credit exposure. The &gt;30-day tier is where
          exposure concentrates fastest.
        </p>
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer>
            <BarChart data={tierData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="tier" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `${(v / 1e7).toFixed(0)}Cr`}
              />
              <Tooltip
                formatter={(v: number) => cr(v)}
                labelFormatter={(l: string) => `${l} tier`}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E2E8F0' }}
              />
              <Bar dataKey="spend" radius={[3, 3, 0, 0]}>
                {tierData.map((t) => (
                  <Cell key={t.tier} fill={TIER_COLOUR[t.tier] ?? '#94A3B8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          {tierData.map((t) => (
            <span key={t.tier} className="tnum">
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                style={{ background: TIER_COLOUR[t.tier] ?? '#94A3B8' }}
              />
              {t.tier}: {pct(t.share, 0)} · {t.brands} brands
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Brands by utilisation</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Highest utilisation first — these are the accounts closest to being paused by Meta.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2 font-medium">Brand</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-4 py-2 text-right font-medium">Terms</th>
                <th className="px-4 py-2 text-right font-medium">Fee</th>
                <th className="px-4 py-2 text-right font-medium">Annual spend</th>
                <th className="px-4 py-2 text-right font-medium">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {(brands.data ?? [])
                .slice()
                .sort((a, b) => (b.utilisationPct ?? 0) - (a.utilisationPct ?? 0))
                .slice(0, 25)
                .map((b) => (
                  <tr key={b.brandId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium">{b.name ?? b.brandId}</td>
                    <td className="px-4 py-2">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase text-white"
                        style={{ background: TIER_COLOUR[b.tier ?? 'unclassified'] }}
                      >
                        {b.tier ?? 'unclassified'}
                      </span>
                    </td>
                    <td className="tnum px-4 py-2 text-right text-slate-600">
                      {b.utilisationDays ?? '—'}/{b.creditDays ?? '—'}
                    </td>
                    <td className="tnum px-4 py-2 text-right text-slate-600">{pct(b.feeRate, 2)}</td>
                    <td className="tnum px-4 py-2 text-right">{cr(b.annualSpend)}</td>
                    <td
                      className={`tnum px-4 py-2 text-right font-medium ${
                        (b.utilisationPct ?? 0) > 0.85 ? 'text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {pct(b.utilisationPct, 0)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Snapshot as of {new Date(d.asOf).toLocaleString('en-IN')} · exposure is peak outstanding
        (utilisation + credit days), not the average
      </p>
    </div>
  );
}

const Loading = () => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
    ))}
  </div>
);

const Err = ({ msg }: { msg: string }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    Could not load the portfolio: {msg}
  </div>
);

const Empty = () => (
  <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
    <p className="text-sm font-medium">No brand data yet</p>
    <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
      The ingestion service has not written a snapshot. Run the Phase 0 spike first, then point the
      ingestion service at this app.
    </p>
  </div>
);
