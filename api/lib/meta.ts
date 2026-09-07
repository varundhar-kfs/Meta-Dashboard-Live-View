/**
 * Read-only Meta Graph access. The single place this app talks to Meta.
 *
 * Everything here is a GET. There is no write path in this codebase.
 */
const BASE = 'https://graph.facebook.com';

export interface Cfg {
  token: string;
  version: string;
  businessId: string;
}

export function cfg(): Cfg {
  const token = process.env.META_ACCESS_TOKEN;
  const businessId = process.env.META_BUSINESS_ID;
  if (!token) throw new Error('META_ACCESS_TOKEN is not set — add it in Dashboard → Secrets');
  if (!businessId) throw new Error('META_BUSINESS_ID is not set — add it in Dashboard → Secrets');
  return { token, businessId, version: process.env.META_API_VERSION || 'v23.0' };
}

async function get<T>(c: Cfg, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}/${c.version}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    // Header, not a query param — a token in a URL ends up in access logs.
    headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = (json as { error?: { message?: string; code?: number } }).error;
    const err = new Error(e?.message ?? `HTTP ${res.status} on ${path}`);
    (err as Error & { code?: number; status?: number }).code = e?.code;
    (err as Error & { code?: number; status?: number }).status = res.status;
    throw err;
  }
  return json as T;
}

/** Follows paging cursors. Most of these edges are small, but allocations can page. */
async function getAll<T>(c: Cfg, path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  let page = await get<{ data?: T[]; paging?: { cursors?: { after?: string } } }>(c, path, {
    limit: '100',
    ...params,
  });
  out.push(...(page.data ?? []));
  for (let i = 0; i < 20; i += 1) {
    const after = page.paging?.cursors?.after;
    if (!after || !page.data?.length) break;
    page = await get(c, path, { limit: '100', ...params, after });
    out.push(...(page.data ?? []));
  }
  return out;
}

/** Runs tasks with bounded concurrency so a wide fan-out stays inside the 60s API limit. */
async function pool<I, O>(items: I[], limit: number, fn: (i: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** Amounts arrive as either a bare string or a {amount,currency} object. */
function amt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object') {
    const n = Number(String((v as { amount?: unknown }).amount ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function cur(v: unknown): string | null {
  if (v && typeof v === 'object') {
    const c = (v as { currency?: unknown }).currency;
    if (typeof c === 'string') return c;
  }
  return null;
}

const CREDIT_FIELDS =
  'id,legal_entity_name,allocated_amount,balance,credit_available,max_balance,' +
  'online_max_balance,credit_type,is_access_revoked,owner_business_name,' +
  'liable_biz_name,partition_from,receiving_credit_allocation_config';

const ALLOC_FIELDS =
  'id,amount,liability_type,partition_type,request_status,send_bill_to,' +
  'receiving_business,owning_business,receiving_credit_allocation_config';

const INVOICE_FIELDS =
  'id,invoice_id,invoice_date,due_date,payment_term,payment_status,liability_type,' +
  'entity,currency,amount,amount_due,billed_amount_details,ad_account_ids,billing_period';

const ACCOUNT_FIELDS =
  'id,account_id,name,account_status,currency,amount_spent,spend_cap,balance,' +
  'is_prepay_account,funding_source_details,business';

export interface CreditLine {
  id: string;
  name: string | null;
  currency: string | null;
  limit: number | null;
  spent: number | null;
  available: number | null;
  allocatedOut: number | null;
  creditType: string | null;
  accessRevoked: boolean;
  liableBusiness: string | null;
}

export interface Allocation {
  id: string;
  creditLineId: string;
  merchant: string;
  merchantBusinessId: string | null;
  currency: string | null;
  allocated: number | null;
  liabilityType: string | null;
  partitionType: string | null;
  status: string | null;
  /** From the child credit line, when Meta exposes it. */
  used: number | null;
  available: number | null;
  utilisation: number | null;
  /** Why utilisation is missing, if it is. */
  utilisationNote: string | null;
}

export interface AdAccount {
  id: string;
  name: string | null;
  business: string | null;
  currency: string | null;
  status: number | null;
  spent: number | null;
  spendCap: number | null;
  walletRemaining: number | null;
  prepay: boolean;
}

export interface Invoice {
  id: string;
  invoiceId: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paymentStatus: string | null;
  paymentTerm: string | null;
  liabilityType: string | null;
  currency: string | null;
  amount: number | null;
  amountDue: number | null;
  adAccountIds: string[];
  billingPeriod: string | null;
}

/** Billed spend per ad account, derived from invoices. */
export interface BilledAccount {
  adAccountId: string;
  billed: number;
  due: number;
  invoices: number;
  currency: string | null;
  lastInvoiceDate: string | null;
}

export async function fetchCreditLines(c: Cfg): Promise<CreditLine[]> {
  const raw = await getAll<Record<string, unknown>>(c, `/${c.businessId}/extendedcredits`, {
    fields: CREDIT_FIELDS,
  });
  return raw.map((r) => ({
    id: String(r['id']),
    name: (r['legal_entity_name'] as string) ?? null,
    currency: cur(r['max_balance']) ?? cur(r['balance']),
    limit: amt(r['max_balance']) ?? amt(r['online_max_balance']),
    spent: amt(r['balance']),
    available: amt(r['credit_available']),
    allocatedOut: amt(r['allocated_amount']),
    creditType: (r['credit_type'] as string) ?? null,
    accessRevoked: Boolean(r['is_access_revoked']),
    liableBusiness: (r['liable_biz_name'] as string) ?? null,
  }));
}

/** The child credit line id is nested under varying keys depending on the payload. */
function childId(o: unknown): string | null {
  if (!o || typeof o !== 'object') return null;
  const direct = (o as { id?: unknown }).id;
  if (typeof direct === 'string') return direct;
  for (const v of Object.values(o as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const nested = (v as { id?: unknown }).id;
      if (typeof nested === 'string') return nested;
    }
  }
  return null;
}

export async function fetchAllocations(c: Cfg, lines: CreditLine[]): Promise<Allocation[]> {
  const nested = await pool(lines, 4, async (line) => {
    const raw = await getAll<Record<string, unknown>>(
      c,
      `/${line.id}/owning_credit_allocation_configs`,
      { fields: ALLOC_FIELDS },
    ).catch(() => [] as Record<string, unknown>[]);
    return raw.map((r) => ({ line, r }));
  });

  const flat = nested.flat();

  return pool(flat, 8, async ({ line, r }): Promise<Allocation> => {
    const biz = r['receiving_business'] as { id?: string; name?: string } | undefined;
    const base: Allocation = {
      id: String(r['id']),
      creditLineId: line.id,
      merchant: biz?.name ?? biz?.id ?? 'unknown',
      merchantBusinessId: biz?.id ?? null,
      currency: cur(r['amount']) ?? line.currency,
      allocated: amt(r['amount']),
      liabilityType: (r['liability_type'] as string) ?? null,
      partitionType: (r['partition_type'] as string) ?? null,
      status: (r['request_status'] as string) ?? null,
      used: null,
      available: null,
      utilisation: null,
      utilisationNote: null,
    };

    const child = childId(r['receiving_credit_allocation_config']);
    if (!child) {
      base.utilisationNote = 'no child credit line on the allocation payload';
      return base;
    }
    try {
      const node = await get<Record<string, unknown>>(c, `/${child}`, { fields: CREDIT_FIELDS });
      const limit = amt(node['max_balance']);
      const avail = amt(node['credit_available']);
      const spent = amt(node['balance']);
      const used = spent ?? (limit != null && avail != null ? limit - avail : null);
      base.used = used;
      base.available = avail;
      const denom = limit ?? base.allocated;
      base.utilisation = used != null && denom ? used / denom : null;
      if (base.utilisation == null) base.utilisationNote = 'child line returned no usable amounts';
    } catch (e) {
      base.utilisationNote = e instanceof Error ? e.message : String(e);
    }
    return base;
  });
}

export async function fetchAdAccounts(c: Cfg): Promise<AdAccount[]> {
  const seen = new Map<string, Record<string, unknown>>();
  for (const edge of ['client_ad_accounts', 'owned_ad_accounts']) {
    const raw = await getAll<Record<string, unknown>>(c, `/${c.businessId}/${edge}`, {
      fields: ACCOUNT_FIELDS,
    }).catch(() => [] as Record<string, unknown>[]);
    for (const r of raw) seen.set(String(r['id']), r);
  }
  return [...seen.values()].map((r) => {
    const spent = amt(r['amount_spent']);
    const cap = amt(r['spend_cap']);
    const biz = r['business'] as { name?: string } | undefined;
    return {
      id: String(r['id']),
      name: (r['name'] as string) ?? null,
      business: biz?.name ?? null,
      currency: (r['currency'] as string) ?? null,
      status: typeof r['account_status'] === 'number' ? (r['account_status'] as number) : null,
      spent,
      spendCap: cap && cap > 0 ? cap : null,
      walletRemaining: cap && cap > 0 && spent != null ? cap - spent : null,
      prepay: Boolean(r['is_prepay_account']),
    };
  });
}


/**
 * Meta invoices for OUR business. Under Normal liability GoKwik is the billed
 * entity, so these carry spend for merchant-owned ad accounts too — which makes
 * them the only route to per-merchant utilisation when the credit sits in the
 * merchant's own Business Manager and we cannot read their child credit line.
 *
 * Monthly and lagging, unlike the credit line, so it is billed-to-date rather
 * than live. That distinction matters and the UI states it.
 */
export async function fetchInvoices(c: Cfg, since: string, until: string): Promise<Invoice[]> {
  const raw = await getAll<Record<string, unknown>>(c, `/${c.businessId}/business_invoices`, {
    fields: INVOICE_FIELDS,
    start_date: since,
    end_date: until,
  });
  return raw.map((r) => ({
    id: String(r['id']),
    invoiceId: (r['invoice_id'] as string) ?? null,
    invoiceDate: (r['invoice_date'] as string) ?? null,
    dueDate: (r['due_date'] as string) ?? null,
    paymentStatus: (r['payment_status'] as string) ?? null,
    paymentTerm: (r['payment_term'] as string) ?? null,
    liabilityType: (r['liability_type'] as string) ?? null,
    currency: (r['currency'] as string) ?? cur(r['amount_due']),
    amount: amt(r['amount']),
    amountDue: amt(r['amount_due']),
    adAccountIds: Array.isArray(r['ad_account_ids'])
      ? (r['ad_account_ids'] as unknown[]).map(String)
      : [],
    billingPeriod: (r['billing_period'] as string) ?? null,
  }));
}

/**
 * Roll invoices up per ad account. Where one invoice covers several accounts Meta
 * does not split the amount, so it is apportioned evenly and flagged — better to
 * show an approximation labelled as one than to drop the row.
 */
export function billedByAccount(invoices: Invoice[]): { rows: BilledAccount[]; apportioned: number } {
  const map = new Map<string, BilledAccount>();
  let apportioned = 0;
  for (const inv of invoices) {
    if (inv.adAccountIds.length === 0) continue;
    if (inv.adAccountIds.length > 1) apportioned += 1;
    const share = inv.adAccountIds.length;
    for (const id of inv.adAccountIds) {
      const row = map.get(id) ?? {
        adAccountId: id, billed: 0, due: 0, invoices: 0,
        currency: inv.currency, lastInvoiceDate: null,
      };
      row.billed += (inv.amount ?? 0) / share;
      row.due += (inv.amountDue ?? 0) / share;
      row.invoices += 1;
      if (!row.lastInvoiceDate || (inv.invoiceDate && inv.invoiceDate > row.lastInvoiceDate)) {
        row.lastInvoiceDate = inv.invoiceDate;
      }
      map.set(id, row);
    }
  }
  return {
    rows: [...map.values()].sort((a, b) => b.billed - a.billed),
    apportioned,
  };
}
