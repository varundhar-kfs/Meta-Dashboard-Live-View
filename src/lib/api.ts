import { createApiClient } from '../../api/platform-sdk';

export const api = createApiClient();

export interface Brand {
  brandId: string;
  name?: string;
  tier?: 'prepaid' | 'pg-daily' | 'short' | 'long' | 'unclassified';
  feeRate?: number;
  utilisationDays?: number;
  creditDays?: number;
  annualSpend?: number;
  outstanding?: number;
  allocation?: number;
  utilisationPct?: number;
}

export interface Portfolio {
  brands: number;
  annualSpend: number;
  annualRevenue: number;
  peakExposure: number;
  exposureOverRevenue: number | null;
  breakevenAnnualDefaultRate: number | null;
  tiers: Record<string, { brands: number; spend: number }>;
  asOf: string;
}

export type TopupState =
  | 'PAID_UNVERIFIED' | 'VERIFIED' | 'LOADING' | 'LOADED' | 'FAILED' | 'MANUAL_REVIEW';

export interface Topup {
  topupId: string;
  brandId: string | null;
  adAccountId: string | null;
  paid: number;
  feeRate: number | null;
  spendToLoad: number | null;
  fee: number | null;
  state: TopupState;
  notes?: string[];
  ref: string;
  createdAt: string;
  capBefore?: number;
  capAfter?: number;
  lastError?: string;
}

export const inr = (n: number | null | undefined, dp = 0): string =>
  n == null || !Number.isFinite(n)
    ? '—'
    : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: dp })}`;

export const cr = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? '—' : `₹${(n / 1e7).toFixed(2)} Cr`;

export const pct = (n: number | null | undefined, dp = 1): string =>
  n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(dp)}%`;
