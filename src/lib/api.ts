import { createApiClient } from '../../api/platform-sdk';

export const api = createApiClient();

export interface CreditLine {
  id: string; name: string | null; currency: string | null;
  limit: number | null; spent: number | null; available: number | null;
  allocatedOut: number | null; creditType: string | null;
  accessRevoked: boolean; liableBusiness: string | null;
}

export interface Allocation {
  id: string; creditLineId: string; merchant: string; merchantBusinessId: string | null;
  currency: string | null; allocated: number | null;
  liabilityType: string | null; partitionType: string | null; status: string | null;
  used: number | null; available: number | null;
  utilisation: number | null; utilisationNote: string | null;
}

export interface AdAccount {
  id: string; name: string | null; business: string | null; currency: string | null;
  status: number | null;
  outstanding: number | null;   // Meta: "Outstanding balance" — bill amount due
  spent: number | null;         // counted against the cap since it was last reset
  spendCap: number | null;      // Meta: "Spending limit" — the wallet ceiling
  remaining: number | null;     // Meta: "Remaining amount"
  prepay: boolean;
}

export interface BilledAccount {
  adAccountId: string; billed: number; due: number;
  invoices: number; currency: string | null; lastInvoiceDate: string | null;
}

export interface Overview {
  asOf: string;
  apiVersion: string;
  currency: string | null;
  facility: { limit: number; spent: number; available: number; allocatedOut: number };
  lines: CreditLine[];
  allocations: Allocation[];
  accounts: AdAccount[];
  billed: {
    window: { since: string; until: string };
    invoices: number;
    totalBilled: number;
    totalDue: number;
    apportionedInvoices: number;
    byAccount: BilledAccount[];
  };
  coverage: {
    allocations: number; withUtilisation: number;
    utilisationReadable: boolean; adAccounts: number;
    invoices: number; billedAccounts: number;
  };
}

/** Indian money, chosen scale. Lakh/crore because that is how the book is discussed. */
export function money(n: number | null | undefined, currency: string | null = 'INR'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sym = currency === 'USD' ? '$' : currency === 'INR' || !currency ? '₹' : `${currency} `;
  const a = Math.abs(n);
  if (sym === '₹') {
    if (a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)} L`;
  } else if (a >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
  return `${sym}${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export const exact = (n: number | null | undefined, currency: string | null = 'INR'): string =>
  n == null || !Number.isFinite(n)
    ? '—'
    : `${currency === 'USD' ? '$' : '₹'}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const pct = (n: number | null | undefined, dp = 0): string =>
  n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(dp)}%`;

/** Meta's numeric account_status, as words. */
export const ACCOUNT_STATUS: Record<number, string> = {
  1: 'active', 2: 'disabled', 3: 'unsettled', 7: 'pending review',
  8: 'pending closure', 9: 'in grace period', 100: 'closed', 101: 'any active', 201: 'any closed',
};
