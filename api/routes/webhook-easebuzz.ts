import { Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, tableName, PutCommand, GetCommand, platform } from '../platform-sdk';
import { K, type TopupState } from '../lib/keys';
import { splitPayment } from '../lib/money';

/**
 * Easebuzz payment webhook.
 *
 * Routes under /api/webhook/ bypass platform SSO by design, so this handler is
 * the ONLY thing standing between the open internet and a credit extension.
 * It therefore: verifies the signature, fails closed if the secret is missing,
 * is idempotent on the gateway reference, and never writes to Meta inline —
 * it enqueues a job so a slow Meta call cannot hold the webhook open.
 */
export const easebuzz = new Hono();

const Payload = z.object({
  txnid: z.string().min(1),
  easepayid: z.string().optional(),
  status: z.string().min(1),
  amount: z.coerce.number().positive(),
  email: z.string().optional().default(''),
  firstname: z.string().optional().default(''),
  productinfo: z.string().optional().default(''),
  hash: z.string().min(1),
  udf1: z.string().optional().default(''),
  udf2: z.string().optional().default(''),
  udf3: z.string().optional().default(''),
  udf4: z.string().optional().default(''),
  udf5: z.string().optional().default(''),
});

/**
 * Easebuzz reverse hash. Order is the PayU-family convention:
 *   salt|status|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 *
 * CONFIRM THIS AGAINST EASEBUZZ'S CURRENT DOCS before going live. A wrong field
 * order fails closed (every request rejected), which is the safe direction, but
 * it will look like an outage.
 */
function expectedHash(p: z.infer<typeof Payload>, key: string, salt: string): string {
  const parts = [
    salt, p.status, p.udf5, p.udf4, p.udf3, p.udf2, p.udf1,
    p.email, p.firstname, p.productinfo, String(p.amount), p.txnid, key,
  ];
  return crypto.createHash('sha512').update(parts.join('|')).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a.toLowerCase(), 'utf8');
  const bb = Buffer.from(b.toLowerCase(), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

easebuzz.post('/api/webhook/easebuzz/payment', async (c) => {
  const key = process.env.EASEBUZZ_MERCHANT_KEY;
  const salt = process.env.EASEBUZZ_SALT;
  if (!key || !salt) {
    // Fail closed. An unverifiable webhook must never move money.
    console.error('easebuzz webhook hit but EASEBUZZ_MERCHANT_KEY/EASEBUZZ_SALT are not configured');
    return c.json({ error: 'Gateway verification not configured' }, 503);
  }

  const raw = await c.req.parseBody().catch(() => null);
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    console.warn('easebuzz webhook rejected: schema', parsed.error.issues.map((i) => i.path.join('.')));
    return c.json({ error: 'Malformed payload' }, 400);
  }
  const p = parsed.data;

  if (!timingSafeEqualHex(expectedHash(p, key, salt), p.hash)) {
    console.warn(`easebuzz webhook rejected: bad signature on txnid ${p.txnid}`);
    return c.json({ error: 'Invalid signature' }, 403);
  }

  if (p.status.toLowerCase() !== 'success') {
    console.log(`easebuzz txnid ${p.txnid} status=${p.status} — recorded, not actionable`);
    return c.json({ ok: true, actioned: false, reason: `status ${p.status}` });
  }

  const ref = p.easepayid ?? p.txnid;

  // Idempotency: the same reference must never create two credit extensions.
  const existing = await db.send(
    new GetCommand({ TableName: tableName('topups', c), Key: K.topupByRef(ref) }),
  );
  if (existing.Item) {
    console.log(`easebuzz ref ${ref} already seen → topup ${existing.Item['topupId']}`);
    return c.json({ ok: true, duplicate: true, topupId: existing.Item['topupId'] });
  }

  // udf1 carries our brand id, udf2 the target ad account. Both are set when the
  // payment link is generated, so we never have to guess who paid.
  const brandId = p.udf1 || null;
  const adAccountId = p.udf2 || null;

  const brand = brandId
    ? await db.send(new GetCommand({ TableName: tableName('brands', c), Key: K.brand(brandId) }))
    : null;
  const feeRate = Number(brand?.Item?.['feeRate'] ?? NaN);

  let split: ReturnType<typeof splitPayment> | null = null;
  let state: TopupState = 'PAID_UNVERIFIED';
  const notes: string[] = [];

  if (!brandId || !adAccountId) {
    state = 'MANUAL_REVIEW';
    notes.push('payment link did not carry brand id (udf1) and ad account (udf2)');
  } else if (!Number.isFinite(feeRate)) {
    state = 'MANUAL_REVIEW';
    notes.push(`no programme fee on record for brand ${brandId}`);
  } else {
    try {
      split = splitPayment(p.amount, feeRate);
    } catch (e) {
      state = 'MANUAL_REVIEW';
      notes.push(`fee split refused: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const topupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const item = {
    ...K.topup(topupId),
    topupId, ref, txnid: p.txnid, brandId, adAccountId,
    paid: p.amount, feeRate: Number.isFinite(feeRate) ? feeRate : null,
    spendToLoad: split?.spend ?? null, fee: split?.fee ?? null, gst: split?.gst ?? null,
    state, notes, source: 'easebuzz-webhook', createdAt: now, updatedAt: now,
    history: [{ at: now, to: state, by: 'webhook' }],
  };

  await db.send(new PutCommand({ TableName: tableName('topups', c), Item: item }));
  await db.send(new PutCommand({
    TableName: tableName('topups', c),
    Item: { ...K.topupByRef(ref), topupId, createdAt: now },
  }));

  console.log(`easebuzz txnid ${p.txnid} → topup ${topupId} state=${state} spend=${split?.spend ?? 'n/a'}`);

  // Deliberately NOT auto-loading. Verification stays in the loop — it is the
  // control that makes automation safe. Phase 4 flips this to an auto-enqueue
  // once reconciliation has been clean for a sustained period.
  if (state === 'PAID_UNVERIFIED') {
    await platform.jobs
      .enqueue('/api/jobs/notify-verification', { topupId })
      .catch((e: unknown) => console.error('notify enqueue failed', e));
  }

  return c.json({ ok: true, topupId, state, spendToLoad: split?.spend ?? null });
});

export default easebuzz;
