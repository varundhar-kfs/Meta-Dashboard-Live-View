# Meta Credit Tower

A read-only dashboard for GoKwik's Meta ads credit programme. Shows the facility, what
each merchant has been allocated, how much of it they've used, and per-ad-account spend
and wallet — pulled live from Meta each time you load it.

**Read-only by design.** There is no write path anywhere in this codebase: no top-ups,
no `spend_cap` changes, no gateway integration. Every Meta call is a `GET`.

Built for GoKwik's internal app platform. No database, no external services.

---

## What you need

Three values, added in **Dashboard → Secrets** after the first deploy:

| Secret | Required | What it is |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | yes | System user token from GoKwik's Business Manager. Needs **`business_management`** and **`ads_read`**. Read scopes only — the app never writes |
| `META_BUSINESS_ID` | yes | The business that **owns** the credit line, not a merchant's. Likely `109096697732006` — confirm in Business Manager |
| `META_API_VERSION` | no | Defaults to `v23.0`. Confirm the current version on developers.facebook.com |

Secrets are runtime-only and backend-only. **Never** give any of these a `VITE_`
prefix — that would ship the token in the frontend bundle.

### Getting the token

Business Manager → **Business settings** → **Users → System users**.

1. Select the system user (or add one)
2. **`···` → Edit info → Finance role → `Finance analyst`**, then save.
   This is the step that matters and it is easy to miss. Credit lines, allocations
   and invoices are billing objects, gated behind the **Finance role** — which is
   separate from Employee/Admin access. Without it the ad accounts read fine and
   the facility comes back empty.
   Choose *analyst*, not *editor*: analyst is view-only, which is all this app does.
3. **Generate token** → pick your app → tick `business_management` and `ads_read`.
   Do **not** grant `ads_management` — there is no write path in this codebase
4. Paste it straight into Dashboard → Secrets. Never into chat, a ticket, or a commit

Assign the merchant ad accounts to the same system user. *Partial access (View
performance)* — the Analyst role — is enough for spend. `spend_cap` and `balance` are
billing fields that usually need Advertiser or Admin on the account, so the **Wallet
left** column will read *not set* for Analyst-only accounts. That degrades cleanly;
only raise those roles if you want the wallet view.

If the facility is still empty with a Finance role assigned, the remaining lever is the
business role (Employee → Admin). For system users that is fixed at creation rather than
editable, so it would mean adding a new system user with Admin access.

## Deploy

```bash
npm install
npm run build          # must pass
npm run build:api      # must pass — emits dist-api/handler.mjs
```

Upload to the platform dashboard, then add the secrets above and reload the page.

`/api/health` reports whether the token and business id are configured, without
revealing either.

## What it shows

**Facility** — limit, drawn, available, and total allocated out across your credit lines.

**Merchant allocations** — one row per allocation: the merchant, what they were
allocated, used and available, liability type, and utilisation as a bar (amber past
70%, red past 85% — the pause-risk zone). Sorted by utilisation, so the accounts
closest to being paused are at the top.

**Ad accounts** — every account visible to your business: amount spent, spend cap, and
wallet remaining (`spend_cap − amount_spent`), blank where no cap is set.

## One thing to expect on first run

Meta reliably exposes **allocation amounts**. Whether it exposes **per-merchant
utilisation** depends on the child credit line behind each allocation returning a
balance, which is not documented and may not work on your facility.

The dashboard handles both cases rather than assuming: if utilisation comes back, you
get the bars. If it doesn't, the column reads *"not exposed"* and a banner explains
why — so **the dashboard itself tells you the answer** on first load.

If it turns out utilisation isn't exposed, per-merchant spend has to come from
ad-account data instead, which needs each merchant to grant your business a role on
their ad accounts. That's a commercial conversation, not a code change.

## How it stays fast

One endpoint, `/api/overview`, fans out across the credit graph with a concurrency
limit of 8 and caches the result for **60 seconds**. That keeps a page load off the
critical path of ~80 Graph calls and well inside the platform's 60s API limit.
**Refresh** bypasses the cache for a genuinely fresh pull.

## Structure

```
api/
  index.ts             health, me, and the one data route
  lib/meta.ts          the ONLY place that talks to Meta — all GETs
  routes/data.ts       /api/overview + read-through cache + error hints
  platform-sdk.ts      platform file, verbatim, do not edit
src/
  App.tsx              the whole dashboard — one page
  components/Bar.tsx   utilisation bar
  lib/api.ts           types and Indian-money formatting
```

## Local development

```bash
npm run dev       # frontend on :5173
npm run dev:api   # API on :3001, proxied by vite
```

Locally, set `META_ACCESS_TOKEN` and `META_BUSINESS_ID` in your shell before
`npm run dev:api`. The platform cache doesn't exist locally, so every request hits Meta
directly — the cache failure is caught and ignored.
