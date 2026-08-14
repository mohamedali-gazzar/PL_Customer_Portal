# Decision log

Every entry records what was decided, why, and where it is enforced in code. Items
marked **BLOCKER** must be resolved before production.

---

## D1 — Tenant identity is provisional · **BLOCKER**

**Decided:** derive the tenant key from the customer name for the prototype. Not
production-safe. Keep the model ready for the real ERPNext `Customer.name`.

**Why it is a blocker, not cosmetic:** the key *is* the name. If a customer's name
is edited in ERPNext, the derived key changes and the same company becomes a
different tenant — its history vanishes from the portal. Two spellings of one
company become two tenants. Normalisation (NFKC, bidi-mark stripping, case,
punctuation, Arabic diacritics) reduces the blast radius; only a real customer id
removes it.

**Where enforced:**
- [`src/providers/excel/identity.ts`](../src/providers/excel/identity.ts) — derivation, normalisation, and `IDENTITY_ASSURANCE`
- `assertIdentitySafeForProduction()` throws when `NODE_ENV=production` with a provisional key, called from [`src/infra/container.ts`](../src/infra/container.ts). `PORTAL_PREVIEW_MODE=1` is the one deliberate override for a non-customer-facing staging deployment, and it logs a warning on every boot — see the M4 section
- `Customer.erpCustomerId` is a `Maybe`, currently `not_in_source`
- Surfaced to the customer-facing payload as `unavailable.identity` so it is visible in the UI, not just in a document

**To resolve:** add `Customer.name` to the export (or move to the ERPNext
provider), populate `erpCustomerId`, and switch `IDENTITY_ASSURANCE` to `verified`.

---

## D2 — Project manager display name is customer-facing

**Decided:** show the PM's display name. Never employee email, phone, employee id
or any other internal employee information.

This resolves the conflict between PDF §2 ("no employee names") and §6.3 plus both
mockups ("PM: Maha K."). The intent was employee *contact details*.

**Where enforced:**
- `Project.projectManager` is modelled as `{ displayName }` only — there is no email or phone field to leak
- `FORBIDDEN_KEY_PATTERNS` rejects any `email`, `phone`, `mobile` or `employee` key
- `FORBIDDEN_VALUE_PATTERNS` rejects any email-shaped *value*, under any key name
- Tested in [`tests/security/dto-blacklist.test.ts`](../tests/security/dto-blacklist.test.ts)

---

## D3 — No money is presented to customers yet

**Decided:** `Backlog Amount` is not contract value. Assume no currency. Do not
present it as financial information. It may be retained internally as
`openOrderValue`.

The export has **no currency column at all**, and PDF §5 requires document currency
always. Dividing the amount by quantity also reveals unit price.

**Where enforced:**
- `Money.currency` is itself a `Maybe`, so an amount and its currency cannot be separated
- `Project.openOrderValue` and `OrderLine.lineValue` exist in the domain and appear in **no** DTO
- `FORBIDDEN_KEY_PATTERNS` rejects `backlogamount`, `openordervalue`, `linevalue`
- A test asserts no payload contains `EGP`, `currency`, `amount`, `grandTotal` or `contractValue`
- Stages 5 and 7 report `unavailable`, and the Finance screen gets `unavailable.finance`

---

## D4 — `On Hold` stays internal

**Decided:** do not expose the raw value until its business meaning and
customer-safe wording are confirmed. 63 rows across 14 projects carry it; it may be
a credit hold.

**Where enforced:** `Project.onHold` exists in the domain, appears in no DTO, and
`onhold` is in `FORBIDDEN_KEY_PATTERNS` with a test asserting its absence.

---

## D5 — Build now, do not wait for more exports

**Decided:** proceed on the current Excel data. Sales Invoice, Payment Entry,
Delivery Note, Stock Entry, customer identifiers, currency, PO numbers and contacts
may arrive later. Do not block.

**Where enforced:** `ProviderCapabilities`. Every unavailable area is a declared
flag, so each new export or the ERPNext provider flips a flag rather than requiring
new UI, new DTOs or new rules. [`tests/domain/stages.test.ts`](../tests/domain/stages.test.ts)
proves stages 4–7 light up under the ERPNext capability set with no rule change.

---

## Decisions taken by default (conservative, still open for review)

These were raised in discovery and not directed. The conservative option was taken
and is easy to reverse.

### D6 — Component item codes are withheld

37 export rows are loose components (MCB, Tmax, Copper Busbar) whose item codes are
supplier part numbers, e.g. ABB `1SDA066317R1`. PDF §7.3 forbids supplier data
reaching the portal, so `ProjectItemDto.itemCode` is `{ known: false, reason:
'restricted' }` on `supplied_component` lines and the description carries the item.

To reverse: remove the branch in `toItem()` in
[`src/application/project-detail.ts`](../src/application/project-detail.ts).

### D7 — Revision count is internal

148 rows have one drawing revision; one has twelve. Displaying "12 revisions" is a
claim about who caused delay. `DrawingRecord.revisionCount` is modelled but not
exposed; only the current drawing status is.

### D8 — Component lines are shown, without a tracker

They are real ordered items, so hiding them would understate the order. They are
classified `supplied_component`, carry `hasProductionJourney: false`, and their
stages report `not_applicable` rather than an empty tracker that would read as
"nothing has happened".

Classification uses the report's own signal: it leaves the RFD count columns
*blank* (not zero) for such items. Blank-versus-zero, not a hand-maintained list of
item groups.

### D9 — Project display name is the raw project name

PDF §8.6 leaves the customer-facing format open, and the PO number it suggests is
absent from this export. The leading code (`520-25-`) is parsed into `projectCode`
separately so a display rule can be applied later without reparsing.

### D10 — Dev session, not real auth

The export has no contact or email data, so no login can be provisioned from it.
[`src/infra/session/dev-session.ts`](../src/infra/session/dev-session.ts) issues an
HMAC-signed cookie and refuses to run in production. It is not "no auth in dev": the
signature means a customer cannot edit the cookie to become another tenant, so the
tenant-isolation tests exercise the real trust boundary. Real authentication
(password hashing, OTP, lockout, the admin-contact flag) is M5.

---

## Derivation decisions inside the rule engine

Recorded here because they are interpretations, not transcriptions, of PDF §4.

### `Main Created` is not the manufacturing actual start

It is the Work Order `creation` timestamp. ERPNext has a real `actual_start_date`
which this export does not carry. Where it is missing, stage 3's actual start falls
back to the **material-ready** date, because that is the company's own definition of
the manufacturing phase — its T5 metric is exactly `manufacturing_complete −
material_ready`, which held on 174 of 174 rows. The fallback is recorded in
`Milestone.provenance` and surfaced to the UI as `actualStartBasis:
'material_ready_proxy'` so it can be labelled. Work Order creation is never used.

### Several work orders on one line roll up to the least advanced status

28 rows carry more than one work order with statuses joined as text ("Completed, Not
Started"). Differing statuses become `mixed`, which the engine resolves to
*in progress*. Reporting the most advanced status would overstate progress.

### `Closed` and `Disassembled` are not in the §4 rule table

`Closed` is treated as complete only when there is a real completion date to point
at; otherwise the stage reports unknown. `Disassembled` (rework) is recorded in
adapter diagnostics as an unmapped status rather than being guessed at. Both should
be added to the rule table by the business.

### Stage 4 is uniformly `partial`, never `default`

Without Stock Entry data the FAT *outcome* is unobservable in both directions, so
every branch is marked `partial`. If the derivation varied by branch, stage 4 would
enter and leave the progress basis as an item advanced — the denominator would
change mid-journey and a percentage could **fall** while work moved forward.

### Stage 5 is unavailable rather than "delivery payment due"

"Delivery Payment Due" is derivable from work order status alone. It is deliberately
not shown: with no Payment Entry data the stage could never reach "Paid", so a
customer who had already paid would see a permanent payment demand. An unavailable
stage is honest; a one-way stage is not.

### Progress covers stages 1–3 and says so

`progressPercent` always travels with `progressBasis`. The UI must render "97% of
stages 1–3", never a bare "97% complete", which would imply a passed FAT, a cleared
payment and a delivered panel.

### The contractual date is stored, never derived

`Contractual Date ≠ SO Submitted + Contractual Period` on 277 of 311 rows. They are
two independent fields.

### The export's as-of date is recovered from the data

`Age Since SO = asOf − SO Submitted`, so every row implies the same date; the
majority wins and disagreements are counted. The filename also carries a date, but a
filename is not evidence. The frozen `Age Since SO` and `Days To Contractual`
columns are never surfaced — every countdown is recomputed against a live clock in
`Africa/Cairo`.

---

## Environment constraint (not a product decision)

This machine's Application Control policy blocks unsigned native binaries under the
user profile. `esbuild.exe` cannot spawn, which aborts installation of `tsx`,
`vitest` and anything else built on esbuild.

Resolved without changing the architecture: Node 24 runs TypeScript natively (type
stripping) and `node:test` is the test runner. Both are zero-dependency.
`tools/alias-loader.mjs` teaches Node's resolver the `@/*` alias and extensionless
imports, so tests and scripts execute exactly the source that `tsc` and Next.js see
— no build step in between.

Two consequences to keep in mind:
- TypeScript's non-erasable syntax is unavailable: no parameter properties, enums,
  namespaces or decorators. A test in
  [`tests/architecture/boundaries.test.ts`](../tests/architecture/boundaries.test.ts)
  enforces the portable subset.
- Next.js logs a warning and falls back to its WASM compiler. `next build` succeeds;
  compilation is a few seconds slower.


---

## M4 (UI) decisions

### The planned lane is markers, not bars

Mockup 2 draws each of the 7 stages as a planned bar above an actual bar. The source
records a planned *finish* for material and manufacturing and **no planned start for any
stage**, so a planned bar would have to invent its own leading edge. The planned lane
therefore draws one diamond per known planned date, and the chart states this in a note
beneath it so that missing bars are not read as "no plan". The code path for real planned
spans exists and is tested; it activates when ERPNext supplies `planned_start_date`.

### Stage colour encodes state, not stage identity

The mockup's seven-step monochrome orange ramp leaves stages 5-7 nearly
indistinguishable. Stage identity is carried by position, number and label instead,
freeing colour for the distinction that matters here: complete / in progress / not yet /
cannot be shown. The last two are the pair most easily confused and the pair it is most
important to keep apart.

### Item detail is a URL, not a `<details>` element

Keeping all 27 item tables in the DOM and hiding them with CSS made the largest project
page 2 MB, 1.7 MB of it Next's client-navigation payload, which scales with element
count -- for content nobody had asked to see. Selecting an item is now a link
(`?item=...`) re-rendered server-side from the already-cached read model. Page weight
stopped scaling with item count (42 KB gzipped), and the expanded item became
deep-linkable. Still no client JavaScript.

### Two real bugs found while rendering real data

**Inverted stage-1 period.** A drawing released in January and revised in July made stage
1 report an actual start after its actual end, which the timeline drew as an 82%-wide bar
claiming drawings approval took six months. Fixed in `deriveStage1`: the approved branch
now takes the *earliest* submission, which is always on or before the release. The
timeline additionally refuses to draw any span whose start does not precede its end,
since the export contains out-of-order dates by the adapter's own count. Both have
regression tests.

**"1 days late".** Counted phrases now have `.one` and `.other` variants in both
languages, selected by `pluralizer()`.

### `PORTAL_PREVIEW_MODE`

The D1 blocker originally made a production build unstartable on the Excel provider,
which also made it impossible to measure real page weight and latency. A staging or pilot
deployment legitimately needs that, and an absolute block invites someone to weaken the
check itself. `PORTAL_PREVIEW_MODE=1` now permits it, logs a warning on every boot, and
gates the preview sign-in on the same flag.

Verified: without the flag, a production build serves **no customer data on any route**.
Pages render the "sign-in not configured" state, the portal API returns 500, and
`/api/health` returns a structured 503 naming the blocker.

### Styling: CSS Modules, not Tailwind

PDF section 3 suggests Tailwind. Tailwind v4's engine is a native Rust binary, which this
machine's Application Control policy blocks -- the same constraint that removed esbuild.
Writing logical properties directly (`margin-inline-start`, `inset-inline-start`) is also
more direct for a bidirectional UI than a set of `rtl:` overrides, and
`tests/ui/rtl-css.test.ts` fails the build on any physical property, so RTL correctness
holds for stylesheets nobody has opened in Arabic.

### Arabic uses Latin numerals

Every number on the portal sits beside an identifier a customer may need to quote back --
a sales order number, a day count in an email. Mixing numeral systems there costs more
than idiomatic Arabic-Indic digits would gain. Reversible in one place
(`src/ui/i18n/locale.ts`) if the business prefers otherwise.
