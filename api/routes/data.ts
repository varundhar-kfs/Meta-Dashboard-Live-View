import { Hono } from 'hono';
import { platform } from '../platform-sdk';
import { cfg, fetchAdAccounts, fetchAllocations, fetchCreditLines } from '../lib/meta';

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
      const [allocations, accounts] = await Promise.all([
        fetchAllocations(conf, lines),
        fetchAdAccounts(conf).catch(() => []),
      ]);

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

      return {
        asOf: new Date().toISOString(),
        apiVersion: conf.version,
        facility,
        currency: lines[0]?.currency ?? null,
        lines,
        allocations,
        accounts,
        coverage: {
          allocations: allocations.length,
          withUtilisation: withUtil,
          // Answers the Phase 0 question by observation rather than by spike.
          utilisationReadable: allocations.length > 0 && withUtil > 0,
          adAccounts: accounts.length,
        },
      };
    });
    return c.json(payload);
  } catch (e) {
    console.error('overview failed:', e instanceof Error ? e.message : String(e));
    return c.json(fail(e), 502);
  }
});

export default data;
