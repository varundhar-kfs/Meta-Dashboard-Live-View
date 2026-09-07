/**
 * The three-number model from the strategy note. A brand's payment is not the
 * ad spend: it is spend + programme fee + GST on both. Only the spend can be
 * written to an ad account, and only the fee is revenue.
 *
 * Verified against a real top-up: 50,000 spend + 1% fee + 18% GST = 59,590.
 */
export const GST_RATE = 0.18;

export interface Split {
  /** What the brand paid us. */
  paid: number;
  /** Ad spend that can be loaded to the ad account. */
  spend: number;
  /** Our programme fee — the only part that is revenue. */
  fee: number;
  /** Collected on behalf of the government, not revenue. */
  gst: number;
  feeRate: number;
}

/** Given what a brand paid and their programme fee rate, split it three ways. */
export function splitPayment(paid: number, feeRate: number): Split {
  if (!Number.isFinite(paid) || paid <= 0) throw new Error('paid must be a positive number');
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 0.25) {
    // 25% is a deliberate sanity ceiling: one brand's rate was stored as 50.00%
    // in the collections sheet where every other source said 0.50%.
    throw new Error(`feeRate ${feeRate} is outside the plausible 0–25% range — check the brand master`);
  }
  const taxable = paid / (1 + GST_RATE);
  const spend = taxable / (1 + feeRate);
  const fee = taxable - spend;
  return {
    paid: round2(paid),
    spend: round2(spend),
    fee: round2(fee),
    gst: round2(paid - taxable),
    feeRate,
  };
}

/** Inverse: what must a brand pay to get `spend` loaded? */
export function grossUp(spend: number, feeRate: number): number {
  return round2(spend * (1 + feeRate) * (1 + GST_RATE));
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
