import { Hono } from 'hono';
import { platform } from '../platform-sdk';
import {
  billedByAccount, cfg, fetchAdAccounts, fetchAllocations, fetchCreditLines, fetchInvoices,
  rawAccountSample, rawInvoiceSample,
} from '../lib/meta';

/** Invoice window: this year to date is enough to show billed utilisation. */
function invoiceWindow(): { since: string; until: string } {
  const now = new Date();
  const since = process.env.INVOICE_SINCE || `${now.getUTCFullYear()}-01-01`;
  const until = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  return { since, until };
}

export const data = new Hono();

/**
 * One read-through cache in front of Meta. 60 seconds keeps the dashboard fast
 * and stops a page refresh turning into 80 Graph calls; `?refresh=1` bypasses it.
 * Cache failures are non-fatal — the platform cache only exists at runtime.
 */
const TTL = 60;

async function cached<T>(key: string, refresh: boolean, fn: () => Promise<T>): Promise<T> {
  if (!refresh) {
    const hit = await platform.cache.get(key).catch(() => null);
    if (hit) return hit as T;
  }
  const fresh = await fn();
  await platform.cache.set(key, fresh, TTL).catch(() => {});
  return fresh;
}

const isRefresh = (u: string): boolean => new URL(u).searchParams.get('refresh') === '1';

function fail(e: unknown): { error: string; hint?: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: number }).code;
  if (msg.includes('META_ACCESS_TOKEN') || msg.includes('META_BUSINESS_ID')) {
    return { error: msg, hint: 'Add it in Dashboard → Secrets, then reload.' };
  }
  if (code === 190 || code === 102) {
    return { error: msg, hint: 'The token is invalid or expired — regenerate the system user token.' };
  }
  if (code === 200 || code === 3) {
    return { error: msg, hint: 'The token lacks a required permission (business_management / ads_read).' };
  }
  if (code === 803) {
    return { error: msg, hint: 'That business id did not resolve — check META_BUSINESS_ID.' };
  }
  if (code === 4 || code === 17 || code === 613) {
    return { error: msg, hint: 'Rate limited by Meta. Wait a minute and refresh.' };
  }
  return { error: msg };
}

/** Everything the dashboard needs, in one call. */
data.get('/api/overview', async (c) => {
  try {
    const conf = cfg();
    const refresh = isRefresh(c.req.url);
    const payload = await cached('overview', refresh, async () => {
      const lines = await fetchCreditLines(conf);
      const win = invoiceWindow();
      const [allocations, accounts, invoices] = await Promise.all([
        fetchAllocations(conf, lines),
        fetchAdAccounts(conf).catch(() => []),
        // Non-fatal: the dashboard is still useful without the billed view.
        fetchInvoices(conf, win.since, win.until).catch((e) => {
          console.warn('invoices unavailable:', e instanceof Error ? e.message : String(e));
          return [];
        }),
      ]);
      const billed = billedByAccount(invoices);

      const facility = lines.reduce(
        (a, l) => ({
          limit: (a.limit ?? 0) + (l.limit ?? 0),
          spent: (a.spent ?? 0) + (l.spent ?? 0),
          available: (a.available ?? 0) + (l.available ?? 0),
          allocatedOut: (a.allocatedOut ?? 0) + (l.allocatedOut ?? 0),
        }),
        { limit: 0, spent: 0, available: 0, allocatedOut: 0 },
      );

      const withUtil = allocations.filter((x) => x.utilisation != null).length;

      // The visibility gap. We are billed for every account on the credit line, but
      // can only read live spend for accounts our business holds a role on. The
      // difference is the merchant-BM population — the number that makes the
      // access ask concrete rather than abstract.
      const visibleIds = new Set(accounts.map((a) => a.id.replace(/^act_/, '')));
      const billedIds = billed.rows.map((r) => r.adAccountId.replace(/^act_/, ''));
      const blindIds = billedIds.filter((id) => !visibleIds.has(id));
      const blindSpend = billed.rows
        .filter((r) => !visibleIds.has(r.adAccountId.replace(/^act_/, '')))
        .reduce((a, r) => a + r.billed, 0);

      return {
        asOf: new Date().toISOString(),
        apiVersion: conf.version,
        facility,
        currency: lines[0]?.currency ?? null,
        lines,
        allocations,
        accounts,
        billed: {
          window: win,
          // The facility is USD; the invoices are not. Never borrow one's currency
          // for the other's totals.
          currency: invoices.find((i) => i.currency)?.currency ?? null,
          invoices: invoices.length,
          totalBilled: invoices.reduce((a, i) => a + (i.amount ?? 0), 0),
          totalDue: invoices.reduce((a, i) => a + (i.amountDue ?? 0), 0),
          apportionedInvoices: billed.apportioned,
          byAccount: billed.rows,
        },
        coverage: {
          allocations: allocations.length,
          withUtilisation: withUtil,
          // Answers the Phase 0 question by observation rather than by spike.
          utilisationReadable: allocations.length > 0 && withUtil > 0,
          adAccounts: accounts.length,
          invoices: invoices.length,
          billedAccounts: billed.rows.length,
          /** Billed for, but no role held — so live spend is unavailable. */
          blindAccounts: blindIds.length,
          blindBilled: blindSpend,
          liveShareOfBilled:
            billed.rows.length > 0 ? (billed.rows.length - blindIds.length) / billed.rows.length : null,
        },
      };
    });
    return c.json(payload);
  } catch (e) {
    console.error('overview failed:', e instanceof Error ? e.message : String(e));
    return c.json(fail(e), 502);
  }
});

/**
 * Raw payload samples. Meta documents some money fields as minor units and others
 * as CurrencyAmount objects, and the two are indistinguishable once parsed — so
 * when a figure looks wrong, look at what actually came back rather than guessing
 * at a divisor.
 */
data.get('/api/debug/shapes', async (c) => {
  try {
    const conf = cfg();
    const win = invoiceWindow();
    const [invRaw, accRaw] = await Promise.all([
      rawInvoiceSample(conf, win.since, win.until).catch((e: unknown) => ({ error: String(e) })),
      rawAccountSample(conf).catch((e: unknown) => ({ error: String(e) })),
    ]);
    return c.json({
      note:
        'Verbatim from Meta, untouched. Compare each money field against Business ' +
        'Manager to establish whether it is major units, minor units, or an object.',
      invoiceWindow: win,
      invoiceSample: invRaw,
      adAccountSample: accRaw,
    });
  } catch (e) {
    return c.json(fail(e), 502);
  }
});

export default data;
