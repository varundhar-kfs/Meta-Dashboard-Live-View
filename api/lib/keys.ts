/** Single-table key helpers. Entity-prefixed, per the platform's modelling rules. */
export const K = {
  brand: (id: string) => ({ pk: `BRAND#${id}`, sk: 'PROFILE' }),
  brandList: () => ({ pk: 'BRAND', prefix: 'BRAND#' }),
  exposure: (brandId: string, asOf: string) => ({ pk: `EXPOSURE#${brandId}`, sk: asOf }),
  topup: (id: string) => ({ pk: `TOPUP#${id}`, sk: 'STATE' }),
  topupByRef: (ref: string) => ({ pk: `TOPUPREF#${ref}`, sk: 'PTR' }),
  finding: (runId: string, id: string) => ({ pk: `FINDING#${runId}`, sk: id }),
} as const;

/** Top-up lifecycle. Every transition is recorded; nothing is inferred. */
export type TopupState =
  | 'PAID_UNVERIFIED'   // gateway said paid, we have not confirmed against the bank
  | 'VERIFIED'          // Accounts (or the PG settlement feed) confirmed the money
  | 'LOADING'           // spend_cap write in flight
  | 'LOADED'            // cap raised and read back
  | 'FAILED'            // write failed, safe to retry
  | 'MANUAL_REVIEW';    // do not retry automatically

export const TERMINAL: ReadonlySet<TopupState> = new Set(['LOADED', 'MANUAL_REVIEW']);

export const ALLOWED: Record<TopupState, readonly TopupState[]> = {
  PAID_UNVERIFIED: ['VERIFIED', 'MANUAL_REVIEW'],
  VERIFIED: ['LOADING', 'MANUAL_REVIEW'],
  LOADING: ['LOADED', 'FAILED', 'MANUAL_REVIEW'],
  FAILED: ['LOADING', 'MANUAL_REVIEW'],
  LOADED: [],
  MANUAL_REVIEW: [],
};

export function canTransition(from: TopupState, to: TopupState): boolean {
  return ALLOWED[from].includes(to);
}
