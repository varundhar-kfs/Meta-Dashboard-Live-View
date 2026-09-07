import { Hono } from 'hono';
import { db, tableName, QueryCommand, platform } from '../platform-sdk';

export const exposure = new Hono();

/**
 * Brand exposure and utilisation. The heavy computation happens in the K8s
 * ingestion service; this reads the snapshot it writes and caches it, so the
 * console stays fast and inside the 60s API limit.
 */
exposure.get('/api/brands', async (c) => {
  const cached = await platform.cache.get('brands:snapshot').catch(() => null);
  if (cached) return c.json(cached);

  const r = await db
    .send(new QueryCommand({
      TableName: tableName('brands', c),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'BRAND' },
    }))
    .catch(() => ({ Items: [] as Record<string, unknown>[] }));

  const items = r.Items ?? [];
  await platform.cache.set('brands:snapshot', items, 300).catch(() => {});
  return c.json(items);
});

/** Portfolio roll-up: tier mix, exposure, and the breakeven default rate. */
exposure.get('/api/portfolio', async (c) => {
  const r = await db
    .send(new QueryCommand({
      TableName: tableName('brands', c),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'BRAND' },
    }))
    .catch(() => ({ Items: [] as Record<string, unknown>[] }));

  const brands = (r.Items ?? []) as Array<Record<string, unknown>>;
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

  let spend = 0, revenue = 0, peakExposure = 0;
  const tiers: Record<string, { brands: number; spend: number }> = {};

  for (const b of brands) {
    const s = num(b['annualSpend']);
    const tier = String(b['tier'] ?? 'unclassified');
    spend += s;
    revenue += s * num(b['feeRate']);
    // Exposure is peak outstanding: utilisation + credit days, not the average.
    peakExposure += (s / 365) * (num(b['utilisationDays']) + num(b['creditDays']));
    const t = (tiers[tier] ??= { brands: 0, spend: 0 });
    t.brands += 1;
    t.spend += s;
  }

  return c.json({
    brands: brands.length,
    annualSpend: spend,
    annualRevenue: revenue,
    peakExposure,
    exposureOverRevenue: revenue > 0 ? peakExposure / revenue : null,
    // The corrected metric: a default costs one cycle, not a year of spend.
    breakevenAnnualDefaultRate: peakExposure > 0 ? revenue / peakExposure : null,
    tiers,
    asOf: new Date().toISOString(),
  });
});

export default exposure;
