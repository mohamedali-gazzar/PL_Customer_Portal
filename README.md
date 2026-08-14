# Powerline Customer Project Portal

A read-only customer portal: every customer sees where each panel stands in the
production journey, when each milestone was planned and actually happened, and
what the order is worth.

ERPNext is the single source of truth. The portal writes nothing back.

**Status:** running locally against the real backlog export. Not yet deployed, not
yet connected to the live ERP, and not yet safe to expose to the internet — see
[Before this goes online](#before-this-goes-online).

---

## Run it

```bash
npm install
```

Put the PM Phase Cycle Times export at `data/backlog.xlsx`, copy `.env.example` to
`.env.local`, then:

```bash
npm run dev
```

It serves on <http://localhost:3210>. Sign in either as a customer (pick any of the
107 from the demo list) or as Powerline staff with an `@powerline.com.eg` address.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3210 |
| `npm run build` | Production build |
| `npm test` | Full test suite (`node:test`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | Typecheck then test |

---

## What is on screen

| Screen | Content |
| --- | --- |
| **Dashboard** | Contract value, delivered, open backlog, and what is waiting on the customer |
| **Projects** | One card per sales order; opening one gives the item-level milestone timeline |
| **Timeline** | Per panel: the 7 milestones as cards, and one unbroken T1–T8 time track from order to today |
| **Finance** | Value by project. Invoiced/paid/outstanding/overdue are marked unavailable, not zero |
| **Documents** | Work-order records as FAT attachment points; files await the ERPNext File doctype |
| **PM Console** | Staff only: phase cycle times, backlog by PM, stage distribution, contractual performance, every customer |

The UI is a port of the approved prototype (`Powerline_Customer_Portal_4.html`).
`app/globals.css` is that file's stylesheet transcribed verbatim — the only change
is that the eight webfonts now load from `/fonts` instead of being inlined as
base64. Nothing else was altered, so the build renders as the design that was
signed off and any future difference is a deliberate edit rather than drift.

---

## How it is put together

```
Customer browser
   │  authenticated fetch, tenant scope from a signed cookie
   ▼
Next.js route handlers  ── the BFF (brief §3)
   │  one derived snapshot, cached 5 minutes
   ▼
Data provider ── xlsx (today)  │  ERPNext REST (next)
```

| Path | Responsibility |
| --- | --- |
| `src/portal/derive.ts` | **Every status a customer sees.** Raw rows → the read model |
| `src/portal/scope.ts` | The one place a customer's view is cut from the whole |
| `src/portal/types.ts` | The read model both providers produce |
| `src/providers/xlsx.ts` | The PM Phase Cycle Times export |
| `src/providers/erpnext/` | The live ERP, via the read-only service user |
| `src/server/` | Config, session, snapshot cache, auth helpers |
| `src/ui/` | The screens |
| `app/api/` | The BFF endpoints |

Statuses are never stored and never typed by anyone. They are computed from
documents the factory already produces, so there is no second system to keep in
step and nothing to go stale.

### The derivation is verified, not asserted

The prototype was signed off with its fully-derived dataset inline: a complete
statement of what every status, date and percentage should be for all 480 order
lines. `tests/portal/derivation.test.ts` replays the raw export through
`src/portal/derive.ts` and asserts the result matches that dataset field for
field — 480 lines × 7 milestones × (state, status, start, end, planned), plus every
rollup and every cycle-time statistic.

It currently passes exactly. If a rule changes, a customer somewhere sees a
different status, and that test names it.

To enable it (both inputs are real customer data, so both are gitignored):

```bash
node scripts/extract-prototype-oracle.mjs path/to/Powerline_Customer_Portal_4.html
```

---

## Security

| Requirement (brief §7) | How it holds |
| --- | --- |
| Tenant isolation | The customer is read from an HMAC-signed cookie and never from a request parameter. `scopeToCustomer` is the only code that cuts a payload |
| No cross-tenant access | `tests/security/tenant-isolation.test.ts` asserts a scoped payload contains no trace of another tenant — not a name, an item code or an order number |
| No forged sessions | `tests/security/session.test.ts` proves a customer cannot edit the cookie to become another customer or to become staff |
| Portfolio data withheld | A customer payload carries `{ exportDate }` and nothing else from the company-wide metadata. Total backlog, PM workloads and product mix are structurally absent |
| Restricted ERP user | The ERPNext client authenticates as the dedicated read-only service user, and the credential never leaves `client.ts` |
| ERP never called from the browser | The browser only ever talks to this app |
| Load protection | One snapshot, cached, single-flight. A hundred simultaneous customers cause one read |

### Before this goes online

**`PORTAL_DEMO_MODE` must be `0`.** The prototype's sign-in screen shows the
company's total open backlog and lists all 107 customers with their names and open
values — to an unauthenticated visitor. That is right for a demo and wrong for the
internet. The app refuses to boot with it enabled in production unless
`PORTAL_ALLOW_DEMO_IN_PRODUCTION=1` is also set for a deliberate internal staging
deployment.

**Sign-in is not authentication yet.** The current export carries no contact
records, so there is nobody to check a password against; the demo picker stands in
for it. Provisioning logins from ERPNext Customer → Contact — with password
hashing, OTP, lockout and the admin-contact flag that governs financial visibility —
replaces the body of `POST /api/auth/session` and nothing else. Every other route
already reads the session rather than the sign-in.

Also outstanding from the brief: a penetration test as a launch gate, and an audit
log of customer requests.

---

## Deploying

A deployment cannot use the `xlsx` provider. The export is real customer data, so
it is gitignored — which means it is not in the repository and not in anything
built from it. There is no file to read.

So derive locally, publish the result, and point the deployment at it:

```bash
npm run build:snapshot -- --anonymise   # or without the flag, for real data
```

Upload the file from `data/` to storage the deployment can read (Vercel Blob, S3,
any private URL), then set these environment variables on the host:

| Variable | Value |
| --- | --- |
| `PORTAL_DATA_PROVIDER` | `snapshot` |
| `PORTAL_SNAPSHOT_URL` | the uploaded file's URL |
| `PORTAL_SESSION_SECRET` | 32+ random characters — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `PORTAL_DEMO_MODE` | `1` while sign-in is still the demo picker |
| `PORTAL_ALLOW_DEMO_IN_PRODUCTION` | `1` — required, deliberately, because demo mode publishes customer names |

Then redeploy, because environment variables are read at boot. `/api/health` tells
you whether it worked and names the problem if it did not.

Updating the data afterwards is: re-run `build:snapshot`, re-upload, and wait for
the 5-minute cache window. No redeploy.

> **A deployment URL is public unless you make it otherwise.** With demo mode on,
> anyone who has the link sees the sign-in screen's statistics and customer list.
> Either publish the anonymised snapshot, or put the deployment behind Vercel's
> password/SSO protection. Preferably both.

---

## Connecting the live ERP

`src/providers/erpnext/` implements the §9 queries against the documented v15 REST
API and produces the same rows the Excel provider does, so both go through the same
verified derivation and cannot drift apart. It is typed end to end but **has not
been run against a live instance** — the ERP was not reachable from the machine
this was built on.

To switch over: set `PORTAL_DATA_PROVIDER=erpnext` plus the `ERPNEXT_*` credentials.
See [docs/ERPNEXT.md](docs/ERPNEXT.md) for the first-run checklist and the ERP-side
preparation the brief lists in §8.

---

## Data governance

`data/` is gitignored and untracked, and so is every `.xlsx`. The backlog export,
the derived snapshot and the prototype oracle are all real customer data: 107 named
companies, their order values and their delivery performance.

**Before pushing to GitHub**, confirm the repository is private and check that
nothing under `data/` has been added. `git status --ignored` will show it sitting
correctly outside version control.

---

## This machine

Application Control blocks unsigned native binaries under the user profile, so
`esbuild` cannot run — which rules out `tsx`, `vitest` and anything built on them.
Instead Node runs TypeScript natively and `node:test` is the runner; both are
zero-dependency and behave the same in CI. `tools/alias-loader.mjs` teaches Node the
`@/*` alias so tests execute exactly the source that `tsc` and Next.js see.

Two consequences: TypeScript's non-erasable syntax is unavailable (no enums,
parameter properties, namespaces or decorators), and Next.js falls back to its WASM
compiler, which costs a few seconds per build. Tailwind is out for the same reason —
its v4 engine is a native binary — which is moot here, since the prototype's own
stylesheet is what guarantees the design matches.
