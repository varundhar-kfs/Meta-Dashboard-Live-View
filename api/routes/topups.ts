import { Hono } from 'hono';
import { z } from 'zod';
import { db, tableName, GetCommand, PutCommand, QueryCommand, platform } from '../platform-sdk';
import { K, canTransition, TERMINAL, type TopupState } from '../lib/keys';
import { metaConfig, raiseSpendCap } from '../lib/meta';

export const topups = new Hono();

async function load(c: Parameters<Parameters<typeof topups.get>[1]>[0], id: string) {
  const r = await db.send(new GetCommand({ TableName: tableName('topups', c), Key: K.topup(id) }));
  return r.Item ?? null;
}

async function transition(
  c: Parameters<Parameters<typeof topups.get>[1]>[0],
  item: Record<string, unknown>,
  to: TopupState,
  by: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const from = item['state'] as TopupState;
  if (!canTransition(from, to)) {
    throw new Error(`Illegal transition ${from} → ${to}`);
  }
  const now = new Date().toISOString();
  const next = {
    ...item, ...extra, state: to, updatedAt: now,
    history: [...((item['history'] as unknown[]) ?? []), { at: now, from, to, by }],
  };
  await db.send(new PutCommand({ TableName: tableName('topups', c), Item: next }));
  return next;
}

topups.get('/api/topups', async (c) => {
  const r = await db.send(new QueryCommand({
    TableName: tableName('topups', c),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'TOPUP' },
  })).catch(() => ({ Items: [] as Record<string, unknown>[] }));
  return c.json(r.Items ?? []);
});

topups.get('/api/topups/:id', async (c) => {
  const item = await load(c, c.req.param('id'));
  return item ? c.json(item) : c.json({ error: 'Not found' }, 404);
});

/** Accounts confirms the money landed. This is the human control in the loop. */
topups.post('/api/topups/:id/verify', async (c) => {
  const item = await load(c, c.req.param('id'));
  if (!item) return c.json({ error: 'Not found' }, 404);
  try {
    const next = await transition(c, item, 'VERIFIED', c.get('userEmail') || 'unknown');
    return c.json(next);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 409);
  }
});

/** Queue the wallet write. Never runs inline — a Meta call must not hold a request open. */
topups.post('/api/topups/:id/load', async (c) => {
  const item = await load(c, c.req.param('id'));
  if (!item) return c.json({ error: 'Not found' }, 404);
  if (TERMINAL.has(item['state'] as TopupState)) {
    return c.json({ error: `Top-up is ${item['state']} — nothing to do` }, 409);
  }
  const spend = Number(item['spendToLoad']);
  if (!Number.isFinite(spend) || spend <= 0) {
    return c.json({ error: 'No spend amount computed — resolve in manual review' }, 409);
  }
  try {
    await transition(c, item, 'LOADING', c.get('userEmail') || 'unknown');
    const { jobId } = await platform.jobs.enqueue('/api/jobs/load-topup', {
      topupId: item['topupId'],
    });
    return c.json({ queued: true, jobId });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 409);
  }
});

/** Background job: the actual spend_cap raise. Up to 120s, well more than needed. */
topups.post('/api/jobs/load-topup', async (c) => {
  const { topupId } = z.object({ topupId: z.string() }).parse(await c.req.json());
  const item = await load(c, topupId);
  if (!item) return c.json({ error: 'Not found' }, 404);

  const adAccountId = String(item['adAccountId'] ?? '');
  const spend = Number(item['spendToLoad']);
  try {
    const res = await raiseSpendCap(metaConfig(), adAccountId, spend);
    const next = await transition(c, item, res.ok ? 'LOADED' : 'MANUAL_REVIEW', 'job:load-topup', {
      capBefore: res.before, capRequested: res.requested, capAfter: res.after,
      loadedAt: new Date().toISOString(),
    });
    console.log(`topup ${topupId}: cap ${res.before} → ${res.after} (wanted ${res.requested})`);
    return c.json({ ok: res.ok, state: next['state'] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`topup ${topupId} load failed: ${msg}`);
    // FAILED is retryable; the operator decides. We never auto-retry a credit extension.
    await transition(c, item, 'FAILED', 'job:load-topup', { lastError: msg });
    return c.json({ ok: false, error: msg }, 500);
  }
});

topups.post('/api/jobs/notify-verification', async (c) => {
  const { topupId } = z.object({ topupId: z.string() }).parse(await c.req.json());
  const item = await load(c, topupId);
  if (!item) return c.json({ ok: true });
  const to = process.env.ACCOUNTS_NOTIFY_EMAIL;
  if (!to) {
    console.log(`topup ${topupId} awaiting verification (ACCOUNTS_NOTIFY_EMAIL unset, no mail sent)`);
    return c.json({ ok: true, emailed: false });
  }
  await platform.email.send({
    to: [to],
    subject: `Top-up awaiting verification — ₹${Number(item['paid']).toLocaleString('en-IN')}`,
    html:
      `<p>A gateway payment has been recorded and needs confirming against the bank.</p>` +
      `<ul><li>Brand: ${item['brandId']}</li><li>Paid: ₹${item['paid']}</li>` +
      `<li>Ad spend to load: ₹${item['spendToLoad']}</li><li>Ref: ${item['ref']}</li></ul>`,
  });
  return c.json({ ok: true, emailed: true });
});

export default topups;
