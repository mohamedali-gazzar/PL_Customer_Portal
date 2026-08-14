# Powerline Customer Portal

A read-only portal giving each Powerline customer a live view of their orders: where
every panel stands in the 7-stage production journey, what is planned versus what
actually happened, their financial position, and their documents.

**Status: M0–M4 complete.** Domain rules, the Excel data provider, read models, caching,
instrumentation and the customer-facing UI (English/Arabic, RTL, desktop and mobile) are
in place and tested. Real authentication is M5; the ERPNext provider is M6.

- Functional specification: `Powerline_Customer_Portal_Package.pdf`
- Discovery analysis: [docs/PHASE-1-DISCOVERY.md](docs/PHASE-1-DISCOVERY.md)
- Decisions and their enforcement points: [docs/DECISIONS.md](docs/DECISIONS.md)

---

## Getting started

```bash
npm install
```

Put the backlog export at `data/backlog.xlsx` (the whole `data/` directory is
gitignored) and create `.env.local` from `.env.example`.

```bash
npm run verify
```

That parses the real export, prints the stage distribution across all 480 order
lines, reports data-quality diagnostics, composes every screen for every tenant, and
measures provider calls and response times. It is the fastest way to see what the
current data source can and cannot support.

```bash
npm run check      # typecheck + full test suite
npm test           # 203 tests
npm run dev        # http://localhost:3000 -> /en/dashboard
```

Sign in at `/en/sign-in` (or `/ar/sign-in`) with an account identifier printed by
`npm run verify`. That form is development-only.

---

## The two ideas that shape the codebase

**1. The data source is replaceable.** Everything above `PortalDataProvider` is
unaware of Excel. `ExcelBacklogProvider` implements the port today;
`ErpNextApiProvider` will implement the same port in M6. The domain, the composers,
the DTOs and the UI do not change.

```
Excel export   ─┐
                ├─→ PortalDataProvider ─→ domain rules ─→ read models ─→ DTOs ─→ UI
ERPNext API    ─┘        (port)            (pure)         (cached)     (whitelist)
```

**2. Missing data is never faked.** The temporary source supports 3 of the 7 stages
fully, 1 partially, and none of Finance or Documents. Two mechanisms make that
structural rather than a matter of discipline:

- **`Maybe<T>`** — every optionally-sourced field is `Known | Unknown{reason}`,
  never `T | null`. A missing value is *not representable as zero*, so the compiler
  will not let a screen render "0 paid" or "not delivered".
- **`capabilities()`** — the provider *declares* what it can answer. Availability is
  never inferred from an empty array or a caught exception, so an outage can never be
  mistaken for "you have no invoices".

---

## Layout

```
src/
  domain/          pure business rules — no I/O, no framework, no clock reads
    milestones/    the 7-stage engine, one function per PDF §4 stage
    progress/      progress weighting, schedule position
    model/         entities, Maybe<T>, PlainDate, capabilities
  ports/           interfaces: PortalDataProvider, CacheStore, Clock, Session, Metrics
  providers/       ExcelBacklogProvider (now) · FixtureProvider (tests) · ErpNext (M6)
  application/     one composer per screen — the read models
  dto/             customer-facing wire types (hand-written whitelist) + the blacklist
  infra/           cache, metrics, clock, logger, config, composition root, BFF plumbing
  ui/              components, design tokens, i18n — sees @/dto and nothing else
app/
  [locale]/        the screens; the root layout lives here so <html lang dir> is correct
  api/             thin BFF routes
tests/
  domain/          table-driven 7-stage rules
  providers/       adapter, on synthetic rows only
  infra/           cache: SWR, single-flight, invalidation
  security/        IDOR matrix · DTO blacklist · cache-key isolation
  performance/     provider-call budgets
  api/             route handlers end to end
  ui/              stage states, timeline geometry, i18n parity, RTL stylesheet scan
  architecture/    layer boundaries, enforced by the build
data/              GITIGNORED — the real export lives here
```

Dependency direction is enforced by
[tests/architecture/boundaries.test.ts](tests/architecture/boundaries.test.ts):
`domain` imports nothing; `providers` and `infra` may see `domain` and `ports`;
`application` may see `domain`, `ports` and `dto`; **`ui` may see `dto` only** — it
cannot reach a provider, a composer, the cache or the environment. Only the composition
root knows which provider is active, so nothing else can break the Excel → ERPNext swap.

---

## Performance

Measured, not asserted. Numbers below are from `npm run verify` on the real export.

Read models, from `npm run verify`:

| | cold | warm |
|---|---|---|
| Dashboard (largest tenant: 4 projects, 61 lines) | 3 ms - 2 provider calls | 0 ms - **0 provider calls** |
| Project detail (largest project: 27 items) | 2 ms - 3 provider calls | 0 ms - **0 provider calls** |

Rendered pages, production build:

| Page | HTML | gzipped | server time |
|---|---|---|---|
| Dashboard | 52 KB | **12 KB** | 22 ms |
| Projects list | 32 KB | 9 KB | 40 ms |
| Project detail - 27 items, stages | 270 KB | **42 KB** | 53 ms |
| Project detail - 27 items, timeline | 128 KB | 27 KB | 28 ms |
| Project detail - Arabic | 291 KB | 46 KB | 56 ms |
| Finance (unavailable state) | 14 KB | 5 KB | 27 ms |

**The UI ships no client JavaScript of its own.** Every page is a Server Component; the
view toggle, item expansion, language switch and navigation are plain links, so there is
nothing to hydrate and nothing for the browser to orchestrate.

- **No N+1, by construction.** The port offers no per-item read — there is no
  `getLine` or `getWorkOrder` method a caller could loop over. A 27-item project costs
  the same number of calls as a 1-item project, asserted in
  [tests/performance/call-budget.test.ts](tests/performance/call-budget.test.ts).
- **The cached artifact is the composed DTO**, so a warm request is one store read
  and a JSON parse — no provider call, no domain computation, no field mapping. It
  also means a cached payload physically cannot contain an internal field.
- **Tenant-scoped keys by construction.** `CacheKey` is branded and every builder
  requires a `CustomerId`, which can only come from a verified session.
- **O(1) invalidation.** A per-tenant generation counter is part of every key, so an
  ERPNext webhook bumps one integer to retire all of that tenant's entries — no
  `SCAN`, no key enumeration, no window where one tenant sees a mix of payloads.
- **Stale-while-revalidate + single-flight.** A stale entry answers immediately and
  refreshes behind the response; a cache expiry under load causes one recomputation,
  not one per request.
- **Instrumented from the first commit.** `withMetrics()` wraps any provider, so the
  ERPNext call budget is already being measured before ERPNext exists. Every request
  logs `providerCalls`, `providerMs`, cache outcome, `composeMs` and `totalMs`, and
  carries `Server-Timing` outside production.
- **Page weight does not scale with expansion.** Item stage detail is selected by URL
  (`?item=...`) and rendered server-side, rather than pre-rendered for every item and
  hidden with CSS. That change took the 27-item page from 2 MB to 42 KB gzipped and made
  the expanded item deep-linkable.

Redis is implemented ([`UpstashCacheStore`](src/infra/cache/upstash-store.ts)) and
selected with `PORTAL_CACHE_DRIVER=upstash`. `MemoryCacheStore` backs development and
tests against the same contract.

---

## Security

| Control | Where |
|---|---|
| Tenant resolved from the session, never from a request parameter | `PortalDataProvider` takes a branded `CustomerId` first in every method; only `SessionResolver` produces one |
| Cross-tenant access impossible | IDOR matrix over every endpoint and identifier — [tests/security/tenant-isolation.test.ts](tests/security/tenant-isolation.test.ts) |
| A foreign id is indistinguishable from a missing one | Both return 404. A 403 would confirm the id exists |
| No blacklisted field in any response | Deep scan of every composed payload — [tests/security/dto-blacklist.test.ts](tests/security/dto-blacklist.test.ts) |
| No cache cross-contamination | [tests/security/cache-isolation.test.ts](tests/security/cache-isolation.test.ts) |
| Real data out of Git | `data/`, `*.xlsx` and `.env*` gitignored from the first commit; tests run on synthetic fixtures only |
| No credential in the browser | No `NEXT_PUBLIC_` variable exists, asserted by the architecture test |
| Audit log per request | Structured line with a **hashed** tenant — a plaintext tenant would turn the log into a customer list |

Rework, costs, margins, BOM, supplier data, warehouse names, internal work order
ids, internal cycle-time KPIs and the `On Hold` flag are all excluded — several are
modelled in the domain but appear in no DTO, and their absence is tested.

---

## The UI

| | |
|---|---|
| Screens | Dashboard, Projects, Project detail (Stages / Timeline), Finance, Documents, Sign-in |
| Languages | English and Arabic, with `lang`/`dir` on `<html>` and a full RTL layout |
| RTL method | CSS logical properties only, enforced by [tests/ui/rtl-css.test.ts](tests/ui/rtl-css.test.ts) - the timeline mirrors because its offsets are `inset-inline-start` percentages |
| Responsive | Timeline scrolls in its own container; the projects table becomes self-labelling cards below 760px; the item rail stacks below 1000px |
| Styling | Hand-written CSS with design tokens + CSS Modules. Not Tailwind: v4's engine is a native binary this machine blocks, and logical properties are more direct for a bidirectional UI |
| Client JS | None |

### Missing data, four levels

| Level | Treatment |
|---|---|
| Field | An em-dash plus the reason, in a colour used for nothing else. Never blank, never `0` |
| Stage | Four distinguishable states. *Not yet* (light outline) and *cannot be shown* (hatched, `?`) are deliberately different - conflating them would imply a test failed or a payment lapsed |
| Section | Titled panel naming what is missing, why, and which source |
| Scope | Persistent banner: "Data as of 11 Aug 2026 - open orders only", with an expandable list of what the extract excludes |

Progress is never rendered as a bare percentage. It always reads **"97% of stages 1-3"**,
because the source cannot see the other four.

## What the current data source cannot do

Reported honestly by the code, not hidden:

| | |
|---|---|
| Stages 1–3 (drawings, material, manufacturing) | ✅ derivable from evidence |
| Stage 4 (FAT) | ⚠️ status only — no Stock Entry data, so the outcome is unobservable and the stage never completes |
| Stages 5–7 (payment, delivery, financial clearance) | ❌ no invoice, payment, delivery or currency data |
| Finance and Documents modules | ❌ unavailable |
| Delivered quantities | ❌ the export is open-backlog only, so a count would read as zero everywhere |
| Planned dates | ⚠️ material and manufacturing end only; no planned start for any stage |
| Tenant identity | ⚠️ provisional — see D1, a pre-production blocker |

---

## Tooling note

Node 24 runs TypeScript natively and `node:test` is the test runner, because this
machine's Application Control policy blocks esbuild's native binary. Consequence:
TypeScript's non-erasable syntax (parameter properties, enums, namespaces,
decorators) is unavailable, and an architecture test enforces that. `next build`
works — it falls back to its WASM compiler. See the end of
[docs/DECISIONS.md](docs/DECISIONS.md).
