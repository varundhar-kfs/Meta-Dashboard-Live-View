import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ACCOUNT_STATUS, api, exact, money, pct, type Overview } from './lib/api';
import Bar from './components/Bar';

export default function App() {
  const q = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get('/api/overview'),
  });

  const refresh = async () => {
    await api.get('/api/overview?refresh=1');
    await q.refetch();
  };

  return (
    <div className="min-h-screen">
      <header className="relative border-b border-ink-700 bg-ink-900">
        <div className="absolute inset-x-0 top-0 h-px bg-gk-edge" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-gk-orange">GoKwik</span>
              <span className="mx-2 text-ink-600">/</span>
              Meta Credit Tower
            </h1>
            <p className="mt-0.5 text-sm text-ink-300">
              Live credit line, merchant allocations and ad-account spend, read straight from Meta
            </p>
          </div>
          <div className="flex items-center gap-3">
            {q.data && (
              <span className="tnum text-xs text-ink-400">
                as of {new Date(q.data.asOf).toLocaleTimeString('en-IN')} · {q.data.apiVersion}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={q.isFetching}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5 text-sm font-medium text-ink-100 transition hover:border-gk-orange/60 hover:text-gk-orange disabled:opacity-40"
            >
              {q.isFetching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {q.isLoading && <Skeleton />}
        {q.error && <Failure error={q.error as Error} />}
        {q.data && <Dashboard d={q.data} />}
      </main>
    </div>
  );
}

function Dashboard({ d }: { d: Overview }) {
  const cy = d.currency;
  const drawn = d.facility.limit > 0 ? d.facility.spent / d.facility.limit : null;
  const allocs = [...d.allocations].sort(
    (a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1) || (b.allocated ?? 0) - (a.allocated ?? 0),
  );

  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Facility limit" value={money(d.facility.limit, cy)} note={`${d.lines.length} credit line(s)`} />
        <Card label="Drawn" value={money(d.facility.spent, cy)} note={drawn != null ? `${pct(drawn)} of limit` : undefined} tone="warn" />
        <Card label="Available" value={money(d.facility.available, cy)} note="undrawn headroom" tone="good" />
        <Card label="Allocated out" value={money(d.facility.allocatedOut, cy)} note={`${d.coverage.allocations} merchant allocation(s)`} />
      </section>

      {!d.coverage.utilisationReadable && d.coverage.allocations > 0 && (
        <Notice>
          Meta is returning allocation amounts but <strong>not per-merchant utilisation</strong> —
          the child credit line behind each allocation did not expose a balance. That is expected
          where credit is shared into the merchant&rsquo;s <em>own</em> Business Manager: the child line
          belongs to their business, not ours, so our token cannot read it.
          {d.coverage.invoices > 0 ? (
            <>
              {' '}Use <strong>Billed spend</strong> below instead — under Normal liability we are
              the billed entity, so Meta&rsquo;s invoices carry the spend for merchant-owned accounts too.
              Monthly and lagging rather than live, but it is per-account and complete.
            </>
          ) : (
            <>
              {' '}No invoices came back either, so per-merchant spend needs either a role on the
              merchant&rsquo;s ad accounts or the <code className="rounded bg-warn/15 px-1">business_management</code>{' '}
              scope on an <strong>Admin</strong> system user.
            </>
          )}
        </Notice>
      )}

      <Panel
        title="Spend visibility"
        subtitle="Where we can see live spend, and where we are flying on invoices alone."
      >
        <div className="grid grid-cols-1 divide-ink-800 sm:grid-cols-3 sm:divide-x">
          <div className="p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">Live visibility</p>
            <p className="tnum mt-1.5 text-2xl font-semibold text-ok">{d.coverage.adAccounts}</p>
            <p className="mt-1 text-xs leading-snug text-ink-300">
              accounts we hold a role on — spend, limit and remaining update in real time
            </p>
          </div>
          <div className="p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">Billed by Meta</p>
            <p className="tnum mt-1.5 text-2xl font-semibold text-ink-50">{d.coverage.billedAccounts}</p>
            <p className="mt-1 text-xs leading-snug text-ink-300">
              accounts on our invoices — every one of these is our liability
            </p>
          </div>
          <div className="p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">No live view</p>
            <p className="tnum mt-1.5 text-2xl font-semibold text-warn">{d.coverage.blindAccounts}</p>
            <p className="mt-1 text-xs leading-snug text-ink-300">
              billed but no role held · {money(d.coverage.blindBilled, cy)} invoiced
            </p>
          </div>
        </div>
        {d.coverage.blindAccounts > 0 && (
          <p className="border-t border-ink-800 px-4 py-3 text-xs leading-relaxed text-ink-300">
            Those {d.coverage.blindAccounts} accounts sit in merchants&rsquo; own Business Managers.
            The child credit line behind each share belongs to <em>their</em> business, so no token of
            ours can read it — this is structural, not a permissions gap. Invoices are the only
            per-account view available for them, and they lag by a billing cycle. To make any of
            them live, the merchant has to add GoKwik as a partner on the ad account
            (Analyst is enough).
            {d.coverage.liveShareOfBilled != null && (
              <>
                {' '}Today {pct(d.coverage.liveShareOfBilled, 0)} of billed accounts are live.
              </>
            )}
          </p>
        )}
      </Panel>

      <Panel
        title="Merchant allocations"
        subtitle={
          d.coverage.utilisationReadable
            ? `${d.coverage.withUtilisation} of ${d.coverage.allocations} allocations report utilisation. Highest first — these are closest to being paused.`
            : `${d.coverage.allocations} allocations. Utilisation not exposed by Meta for these.`
        }
      >
        {allocs.length === 0 ? (
          <Empty text="No allocations returned for this credit line." />
        ) : (
          <Table
            head={['Merchant', 'Allocated', 'Used', 'Available', 'Liability', 'Status', 'Utilisation']}
            align={['left', 'right', 'right', 'right', 'left', 'left', 'right']}
          >
            {allocs.map((a) => (
              <tr key={a.id} className="border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-850/60">
                <td className="px-4 py-2">
                  <div className="font-medium">{a.merchant}</div>
                  {a.merchantBusinessId && (
                    <div className="font-mono text-[10px] text-ink-400">{a.merchantBusinessId}</div>
                  )}
                </td>
                <td className="tnum px-4 py-2 text-right">{exact(a.allocated, a.currency)}</td>
                <td className="tnum px-4 py-2 text-right">{exact(a.used, a.currency)}</td>
                <td className="tnum px-4 py-2 text-right">{exact(a.available, a.currency)}</td>
                <td className="px-4 py-2">
                  <Pill text={a.liabilityType ?? '—'} tone={a.liabilityType === 'Normal' ? 'warn' : 'neutral'} />
                </td>
                <td className="px-4 py-2 text-xs text-ink-300">{a.status ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {a.utilisation != null ? <Bar value={a.utilisation} /> : <Missing note={a.utilisationNote} />}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel
        title="Ad accounts"
        subtitle={
          d.accounts.length
            ? `${d.accounts.length} account(s) visible to us. Figures come from Meta in the account ` +
              'currency\u2019s smallest unit and are converted here, so they match Business Manager exactly.'
            : 'None visible. Ad-account spend needs each merchant to grant a role on their account.'
        }
      >
        {d.accounts.length === 0 ? (
          <Empty text="No ad accounts reachable from this business." />
        ) : (
          <>
            <Table
              head={['Account', 'Status', 'Outstanding balance', 'Spent', 'Spending limit', 'Remaining']}
              align={['left', 'left', 'right', 'right', 'right', 'right']}
            >
              {[...d.accounts]
                .sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0))
                .map((x) => (
                  <tr key={x.id} className="border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-850/60">
                    <td className="px-4 py-2">
                      <div className="font-medium">{x.name ?? x.id}</div>
                      <div className="font-mono text-[10px] text-ink-400">
                        {x.id}
                        {x.business && <span className="ml-1.5 text-ink-300">{x.business}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Pill
                        text={x.status != null ? (ACCOUNT_STATUS[x.status] ?? String(x.status)) : '—'}
                        tone={x.status === 1 ? 'good' : x.status == null ? 'neutral' : 'warn'}
                      />
                    </td>
                    <td className={`tnum px-4 py-2 text-right ${(x.outstanding ?? 0) > 0 ? 'font-medium text-warn' : 'text-ink-400'}`}>
                      {exact(x.outstanding, x.currency)}
                    </td>
                    <td className="tnum px-4 py-2 text-right text-ink-200">{exact(x.spent, x.currency)}</td>
                    <td className="tnum px-4 py-2 text-right text-ink-200">
                      {x.spendCap != null ? exact(x.spendCap, x.currency) : <span className="text-ink-600">not set</span>}
                    </td>
                    <td className="tnum px-4 py-2 text-right font-medium">
                      {x.remaining != null ? exact(x.remaining, x.currency) : <span className="text-ink-600">—</span>}
                    </td>
                  </tr>
                ))}
            </Table>
            <p className="border-t border-ink-800 px-4 py-2.5 text-xs leading-relaxed text-ink-300">
              <strong>Outstanding balance</strong> is the unpaid bill on the account.{' '}
              <strong>Spent</strong> counts only against the current spending limit and resets when
              that limit is reset — so an account can show zero spent while still carrying a balance.{' '}
              <strong>Remaining</strong> is limit minus spent, which is the usable wallet.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Billed spend, per ad account"
        subtitle={
          d.coverage.invoices > 0
            ? `From ${d.coverage.invoices} Meta invoice(s) since ${d.billed.window.since}. ` +
              `${money(d.billed.totalBilled, cy)} billed, ${money(d.billed.totalDue, cy)} still due. ` +
              'This is billed-to-date, not live — it is the only per-account view available where ' +
              "credit sits in the merchant's own Business Manager."
            : 'No invoices returned. Needs business_management on an Admin system user.'
        }
      >
        {d.billed.byAccount.length === 0 ? (
          <Empty text="No invoice lines carried an ad account id." />
        ) : (
          <>
            <Table
              head={['Ad account', 'Invoices', 'Billed', 'Still due', 'Last invoice']}
              align={['left', 'right', 'right', 'right', 'left']}
            >
              {d.billed.byAccount.map((b) => {
                const known = d.accounts.find((a) => a.id.replace(/^act_/, '') === b.adAccountId.replace(/^act_/, ''));
                return (
                  <tr key={b.adAccountId} className="border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-850/60">
                    <td className="px-4 py-2">
                      <div className="font-medium">{known?.name ?? b.adAccountId}</div>
                      <div className="font-mono text-[10px] text-ink-400">
                        {b.adAccountId}
                        {!known && <span className="ml-1.5 text-warn">not visible to us</span>}
                      </div>
                    </td>
                    <td className="tnum px-4 py-2 text-right text-ink-300">{b.invoices}</td>
                    <td className="tnum px-4 py-2 text-right font-medium">{exact(b.billed, b.currency ?? cy)}</td>
                    <td className={`tnum px-4 py-2 text-right ${b.due > 1 ? 'text-warn' : 'text-ink-400'}`}>
                      {exact(b.due, b.currency ?? cy)}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-300">{b.lastInvoiceDate ?? '—'}</td>
                  </tr>
                );
              })}
            </Table>
            {d.billed.apportionedInvoices > 0 && (
              <p className="border-t border-ink-800 px-4 py-2.5 text-xs text-ink-300">
                {d.billed.apportionedInvoices} invoice(s) covered more than one ad account. Meta does
                not split the amount, so it is apportioned evenly across them — those rows are
                approximate.
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel title="Credit lines seen by this token" subtitle="Compare against Billing & payments → Credit lines. A line missing here is a line this token cannot read.">
        <Table head={['Credit line', 'Type', 'Limit', 'Drawn', 'Available', 'Allocated out']}
               align={['left', 'left', 'right', 'right', 'right', 'right']}>
          {d.lines.map((l) => (
            <tr key={l.id} className="border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-850/60">
              <td className="px-4 py-2">
                <div className="font-medium">{l.name ?? l.id}</div>
                <div className="font-mono text-[10px] text-ink-400">{l.id}</div>
              </td>
              <td className="px-4 py-2 text-xs text-ink-300">{l.creditType ?? '—'}</td>
              <td className="tnum px-4 py-2 text-right">{exact(l.limit, l.currency)}</td>
              <td className="tnum px-4 py-2 text-right text-warn">{exact(l.spent, l.currency)}</td>
              <td className="tnum px-4 py-2 text-right text-ok">{exact(l.available, l.currency)}</td>
              <td className="tnum px-4 py-2 text-right text-ink-200">{exact(l.allocatedOut, l.currency)}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <p className="text-xs text-ink-400">
        Read-only. Cached for 60 seconds — Refresh forces a fresh pull from Meta.
        Rows marked <em>not visible to us</em> are ad accounts we are billed for but hold no role on —
        which is exactly the shared-credit population.
      </p>
    </>
  );
}

/* ---------- small pieces ---------- */

function Card({ label, value, note, tone = 'neutral' }: {
  label: string; value: string; note?: string; tone?: 'neutral' | 'good' | 'warn';
}) {
  const c = { neutral: 'text-ink-50', good: 'text-ok', warn: 'text-warn' }[tone];
  return (
    <div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900 p-4 gk-edge">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className={`tnum mt-2 text-2xl font-semibold tracking-tight ${c}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-ink-300">{note}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }: {
  title: string; subtitle?: string; children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-700 bg-ink-900">
      <div className="border-b border-ink-700 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs leading-snug text-ink-300">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, align, children }: {
  head: string[]; align: Array<'left' | 'right'>; children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-700 bg-ink-850/70 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-medium ${align[i] === 'right' ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Pill = ({ text, tone }: { text: string; tone: 'neutral' | 'good' | 'warn' }) => (
  <span
    className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
      { neutral: 'bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-700', good: 'bg-ok/12 text-ok ring-1 ring-inset ring-ok/25', warn: 'bg-warn/12 text-warn ring-1 ring-inset ring-warn/25' }[tone]
    }`}
  >
    {text}
  </span>
);

const Missing = ({ note }: { note: string | null }) => (
  <span className="text-xs text-ink-400" title={note ?? undefined}>
    not exposed
  </span>
);

const Empty = ({ text }: { text: string }) => (
  <p className="px-4 py-8 text-center text-sm text-ink-300">{text}</p>
);

const Notice = ({ children }: { children: ReactNode }) => (
  <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/[0.07] p-4 text-sm leading-relaxed text-warn">
    <Info size={16} className="mt-0.5 shrink-0" />
    <p>{children}</p>
  </div>
);

const Skeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border border-ink-700 bg-ink-900/60" />
      ))}
    </div>
    <div className="h-64 animate-pulse rounded-lg border border-ink-700 bg-ink-900/60" />
  </div>
);

function Failure({ error }: { error: Error }) {
  return (
    <div className="rounded-lg border border-bad/25 bg-bad/[0.07] p-4">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-bad" />
        <div className="text-sm">
          <p className="font-semibold text-bad">Could not read from Meta</p>
          <p className="mt-1 text-ink-100">{error.message}</p>
          <p className="mt-2 text-xs text-ink-300">
            Check <code className="rounded bg-bad/15 px-1">META_ACCESS_TOKEN</code> and{' '}
            <code className="rounded bg-bad/15 px-1">META_BUSINESS_ID</code> in Dashboard → Secrets,
            then Refresh. <code className="rounded bg-bad/15 px-1">/api/health</code> reports
            whether both are set.
          </p>
        </div>
      </div>
    </div>
  );
}
