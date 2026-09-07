# meta-credit-tower — deployer console

The GoKwik-platform half of the Meta ads credit programme: the operations console,
and the payment-gateway webhook that turns a verified recharge into a wallet top-up.

Built against the platform contract at `/gokwik/deployer/platform-claude.md`
(read 7 Sep 2026). Only allowed dependencies; no blocked packages; no auth code.

## What runs where

| This app (deployer) | The ingestion service (K8s + Postgres) |
| --- | --- |
| Portfolio and utilisation console | Meta credit-graph, invoice and spend ingestion |
| Top-up queue with the human verification step | The ledger and three-way reconciliation |
| `spend_cap` write — one Meta call, well inside limits | Anything over 120s or needing relational queries |
| Easebuzz webhook receiver | |

`pg` is a blocked package and DynamoDB items cap at 400KB, so daily per-ad-account
spend cannot live here. This app reads snapshots the ingestion service writes.

## Deploy

```bash
npm install
npm run build && npm run build:api    # must both pass before uploading
```

Then upload to the platform dashboard. Afterwards, in **Dashboard → Secrets**:

| Secret | Why |
| --- | --- |
| `META_ACCESS_TOKEN` | System user token. Needs `ads_management` for the `spend_cap` write |
| `META_API_VERSION` | Optional, defaults to `v23.0`. Confirm the current version |
| `EASEBUZZ_MERCHANT_KEY` | Webhook signature verification |
| `EASEBUZZ_SALT` | Webhook signature verification |
| `ACCOUNTS_NOTIFY_EMAIL` | Optional. A `@gokwik.co` address for verification alerts |

Secrets are runtime-only and backend-only. Never use a `VITE_` prefix for any of
these — that ships them in the frontend bundle.

## The webhook

```
https://deployer.dev.gokwik.in/_api/app/meta-credit-tower/api/webhook/easebuzz/payment
```

Routes under `/api/webhook/` bypass platform SSO by design, so this handler is the only
thing between the open internet and a credit extension. It therefore:

- **verifies the SHA-512 reverse hash** and rejects on mismatch, timing-safely
- **fails closed** with a 503 if `EASEBUZZ_MERCHANT_KEY`/`EASEBUZZ_SALT` are unset
- **is idempotent** on the gateway reference, so a replayed callback cannot double-credit
- **never calls Meta inline** — it enqueues a job, so a slow Meta call can't hold it open
- **never auto-loads** — a payment lands in `PAID_UNVERIFIED` and waits for Accounts

> ⚠️ **Confirm the hash field order against Easebuzz's current docs before going live.**
> `api/routes/webhook-easebuzz.ts` uses the PayU-family convention
> (`salt|status|udf5..udf1|email|firstname|productinfo|amount|txnid|key`). A wrong order
> fails closed — every request rejected — which is the safe direction, but it looks like
> an outage.

The payment link must carry the brand id in `udf1` and the target ad account in `udf2`.
Without both, the top-up goes straight to `MANUAL_REVIEW` rather than guessing.

## Top-up lifecycle

```
PAID_UNVERIFIED ──► VERIFIED ──► LOADING ──► LOADED
       │                │            │
       └────────────────┴────────────┴──► MANUAL_REVIEW
                                     └──► FAILED ──► LOADING (operator retry)
```

Transitions are validated in `api/lib/keys.ts`; illegal ones return 409. Nothing
auto-retries a credit extension.

## Two deliberate refusals in the Meta client

`api/lib/meta.ts` will not:

- **lower a `spend_cap`** — dropping a cap below `amount_spent` pauses live delivery
- **send `spend_cap_action=reset`** — it zeroes `amount_spent`

It also refuses to set a *first* cap on an account that has none, because on a live
account that changes real spending behaviour. Set the first cap by hand.

## The money model

`api/lib/money.ts`. A brand's payment splits three ways and only one part is revenue:

```
paid = spend × (1 + feeRate) × 1.18
```

Verified against a real top-up: 50,000 spend + 1% fee + 18% GST = 59,590. The splitter
rejects a fee rate above 25% on purpose — one brand's rate is stored as `50.00%` in the
collections sheet where every other source says `0.50%`.

## Local development

```bash
npm run dev        # frontend on :5173
npm run dev:api    # API on :3001, proxied by vite
```

Platform services (`platform.cache`, `.jobs`, `.email`, `.storage`) only exist at
runtime on the platform — they throw if called locally. The console degrades to empty
states rather than crashing.
