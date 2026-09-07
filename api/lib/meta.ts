/**
 * The only place this app talks to Meta. One call, well inside the 60s API limit.
 * Heavy ingestion lives in the K8s service — this is just the wallet write.
 */
const BASE = 'https://graph.facebook.com';

export interface MetaConfig {
  token: string;
  version: string;
}

export function metaConfig(): MetaConfig {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN is not configured — add it in Dashboard → Secrets');
  return { token, version: process.env.META_API_VERSION || 'v23.0' };
}

async function call<T>(
  cfg: MetaConfig,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${BASE}/${cfg.version}${path.startsWith('/') ? path : `/${path}`}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (method === 'GET') url.searchParams.set(k, v);
    else body.set(k, v);
  }
  const res = await fetch(url, {
    method,
    headers: {
      // Header, never a query param — a token in a URL ends up in logs.
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(method === 'POST' ? { body } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Meta ${method} ${path}: ${msg}`);
  }
  return json as T;
}

export interface AccountWallet {
  id: string;
  currency?: string;
  amount_spent?: string;
  spend_cap?: string;
  account_status?: number;
}

export async function readWallet(cfg: MetaConfig, adAccountId: string): Promise<AccountWallet> {
  return call<AccountWallet>(cfg, 'GET', `/${adAccountId}`, {
    fields: 'id,currency,amount_spent,spend_cap,account_status',
  });
}

/**
 * Raise the wallet. Reads current state, adds `deltaMinor`, writes, reads back.
 *
 * Two deliberate refusals:
 *  - never lowers a cap (that can pause live delivery)
 *  - never sends spend_cap_action=reset (it zeroes amount_spent)
 */
export async function raiseSpendCap(
  cfg: MetaConfig,
  adAccountId: string,
  delta: number,
): Promise<{ before: number; requested: number; after: number; ok: boolean }> {
  if (!(delta > 0)) throw new Error('delta must be positive — this function never lowers a cap');

  const before = await readWallet(cfg, adAccountId);
  const currentCap = Number(before.spend_cap ?? 0);
  if (!Number.isFinite(currentCap) || currentCap <= 0) {
    throw new Error(
      `Ad account ${adAccountId} has no spend_cap set. Setting a first cap changes live ` +
        'spending behaviour, so it must be done deliberately in Ads Manager, not by this job.',
    );
  }
  const requested = currentCap + delta;
  await call(cfg, 'POST', `/${adAccountId}`, { spend_cap: String(requested) });

  const after = await readWallet(cfg, adAccountId);
  const newCap = Number(after.spend_cap ?? 0);
  return { before: currentCap, requested, after: newCap, ok: Math.abs(newCap - requested) < 1 };
}
