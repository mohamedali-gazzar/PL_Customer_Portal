# Decision log

What was decided, why, and where it is enforced in code. Items marked **OPEN** need
a business answer.

---

## D0 — The approved prototype is the specification for the UI

**Decided:** `Powerline_Customer_Portal_4.html` is authoritative for what the portal
shows and how it looks. The engineering brief and the backlog export are reference
material for *understanding* the domain, not for overriding the approved design.

**Consequence:** `app/globals.css` is the prototype's stylesheet transcribed
verbatim (only the inlined base64 webfonts were moved to `/fonts`), and the React
components reproduce its DOM structure and class names. Pixel parity is therefore a
property of the transcription rather than something re-achieved by eye, and any
future difference is a deliberate edit.

**This reverses four earlier decisions** taken when the brief alone was the
specification. They were conservative readings of §7.3 made in the absence of an
approved design; the approved design answers each of them directly. Recorded here so
the reasoning is not simply lost:

| Reversed | Was | Now |
| --- | --- | --- |
| Money is not shown | `Backlog Amount` withheld — no currency column, and dividing by quantity reveals unit price | Contract, delivered and backlog values are shown. The unit price recovered is the customer's **own** price on their **own** order, which they already hold in their contract. Currency is EGP, stated and never converted |
| `On Hold` is internal | Business meaning unconfirmed, possibly a credit hold | Shown as an "On hold" pill — see **OPEN-1** |
| Component item codes withheld | Supplier part numbers count as supplier data under §7.3 | Item codes are shown as the prototype shows them |
| Revision count internal | "12 revisions" is a claim about who caused delay | Shown in a timeline tooltip only, as a count, with no attribution |

What §7.3 forbids has **not** been relaxed: no cost or margin field, no BOM, no
supplier record, no internal remark, no rework reason, no employee contact detail
and no warehouse name reaches the portal. None of those exist in the current source
at all.

---

## D1 — Statuses are derived, never stored

Every status is computed from documents the factory already produces. There is no
field anyone fills in to drive the portal, so there is nothing to go stale and no
second system to keep in step.

**Where enforced:** `src/portal/derive.ts` is the only place a status is decided,
and both providers feed it.

---

## D2 — The rules are tested against hand-written rows, not against the export

**Decided:** `tests/portal/derive.test.ts` tests the derivation from fixture rows.
There is no test that reads the spreadsheet.

**How the rules were established:** the approved prototype was signed off with its
fully-derived dataset inline — a complete statement of the expected output for all
480 lines of the 11 August export. Every rule in `derive.ts` was verified against
it field by field: milestone state, status, actual start, actual end, planned date,
plus every rollup and cycle-time statistic. It matched exactly.

**Why that test no longer exists:** it needed the 11 August export beside the
oracle. Only the current export is kept (D11), so the pair is gone, and a test that
cannot run is worse than no test — it reports success while checking nothing.

**What replaced it:** the shapes that proof exercised are now fixture rows, each
one annotated with the real-data case it represents. The knowledge lives in code
rather than in a data file, and it survives every future export.

---

## D11 — Only the current export is kept

**Decided by the data owner:** one spreadsheet, the latest. No archive of previous
exports, and no second copy pinned for testing.

**Consequence:** a data refresh is `npm run build:snapshot`, commit, push. Nothing
in the test suite depends on a particular export, so nothing breaks when the data
moves — which it does weekly.

---

## D3 — Tenant identity is the customer name · **BLOCKER for production**

**Decided:** scope by `Customer` name, because that is all the export carries.

**Why it is a blocker:** the key *is* the name. Renaming a customer in ERPNext makes
them a different tenant and their history vanishes; two spellings of one company
become two tenants.

**Resolution:** the ERPNext provider supplies the real `Customer.name` document id.
Switch scoping to it when that provider goes live.

**Where enforced:** `src/portal/scope.ts`.

---

## D4 — Project manager display name is customer-facing

Show the PM's name; never their email, phone or employee record. This resolves the
tension between §2 ("no employee names") and §6.3 plus both mockups ("PM: …") — the
intent was employee *contact details*. The model carries a name and has no field for
anything else.

---

## D5 — An unavailable figure is never rendered as zero

Stages 5 and 7, and the invoiced/paid/outstanding/overdue tiles, have no source
document in the current export. They render hatched, with a dashed-square icon and a
tooltip naming the missing doctype.

A portal that shows an unknown balance as "EGP 0" has told the customer something
false, and the entire commercial case for the portal is that its numbers can be
trusted without a phone call.

**Where enforced:** `STATE.gap` in `src/portal/types.ts`; `.tile.pend` and the `gap`
pill in the UI. Stage 5 is deliberately *not* derived from work-order status alone:
it could then never reach "Paid", so a customer who had already paid would see a
permanent payment demand.

---

## D6 — Progress excludes unavailable stages from its denominator

`pct` averages the five stages that can be computed, not all seven. Counting an
unavailable stage as incomplete would cap every panel at 71%; letting it enter the
denominator later would let a percentage **fall** while work moved forward.

---

## D7 — The planned lane is markers, not a second bar

Mockup 2 draws each stage as a planned bar above an actual bar. ERPNext stores
planned *end* dates and **no planned start for any stage**, so a planned bar would
have to invent its own leading edge — and an invented edge in a delay conversation is
worse than no edge. The plan is drawn as carets and diamonds, and the chart says so
beneath itself. The overshoot past a marker is hatched red.

Adding `custom_planned_fat_date` and `custom_planned_delivery_date` makes their
markers appear with no code change.

---

## D8 — The sign-in picker is a flag, on by default

The sign-in screen publishes the company's total backlog and every customer name
and open value to an unauthenticated visitor.

`PORTAL_DEMO_MODE` controls both, and **defaults on** — because the customer picker
is currently the only way into the portal, so gating it off in production would make
production unusable. The earlier double-gate was removed with it: the data owner has
decided the data is not confidential (D10), so the control is access protection at
the host, not a flag in the code. Set it to `0` once logins are provisioned from
ERPNext contacts.

**Where enforced:** `src/server/config.ts`; `gatewayView` in `src/portal/scope.ts`;
`tests/security/tenant-isolation.test.ts`.

---

## D9 — Sign-in issues a session; it does not yet verify a credential

The export has no contact records, so there is nobody to check a password against.
Rather than build authentication that looks real and is not, sign-in is gated on
demo mode and refuses outright without it.

The session itself **is** real: HMAC-signed, httpOnly, expiring, naming exactly one
tenant, and proved unforgeable in `tests/security/session.test.ts`. Real
authentication replaces the body of `POST /api/auth/session` and nothing else,
because every other route already reads the session rather than the sign-in.

---

## Derivation decisions inside the rule engine

Interpretations, not transcriptions, of §4. Each is verified against the approved
dataset.

**A joined work-order status resolves to the most advanced.** 28 lines carry several
work orders with statuses joined as text ("Completed, Not Started"). The line has
demonstrably reached the furthest point; reporting the least advanced would hide real
progress. `Closed` counts as complete — ERPNext closes a work order that will not be
worked further, and the brief's rule table predates that status.

**Manufacturing starts when material lands.** Where that timestamp is absent, the
work order's creation is the only honest fallback.

**Drawings approval starts at the earliest drawing activity of any kind.** Taking the
release date would let a revision cycle make the stage appear to start after it ended.

**Only an *initial* drawing submission opens the chain.** A revision is not a first
submission, so T1 is measured from Initial Approval RFDs alone.

**The chain is forced monotonic.** Production data contains timestamps stamped out of
order; a bar must never be drawn running backwards. Where a middle timestamp is
missing the phases either side are merged and labelled as one span ("T3–T4") rather
than a boundary being guessed.

**T1–T8 are the gaps between consecutive chain timestamps.** Verified as an exact
identity against the report's own T columns on all 480 lines, which is what licenses
the ERPNext provider to compute them rather than read them from a report.

**The as-of date is recovered from the rows.** Every row's `Age Since SO` implies the
same date; the majority wins. The filename also carries a date, but a filename is not
evidence.

**Percentiles are nearest-rank, not interpolated.** The p90 is quoted to the business
as "nine in ten finish within N days", and that sentence is only true of a value that
actually occurred.

**Percentages round half to even**, so a value landing exactly on .5 resolves the same
way on every platform.

---

## D10 — Real data only. There is no synthetic mode

**Decided by the data owner:** the portal shows real customers, real projects, real
panels, real engineers, real dates and real values, everywhere, including in
deployments. This is a production system, not a demonstration.

An anonymising option existed briefly and has been removed rather than left
switchable — a synthetic dataset that can be deployed by accident is worse than one
that cannot be deployed at all, and this one was: it reached production and was
reported as a bug, because "Engineer 1" is indistinguishable from a broken name
lookup.

**Consequences, accepted deliberately:**

- `content/portal-snapshot.json` is committed and carries real customer data. The
  `.gitignore` block that forbade this is now scoped to the raw spreadsheets only,
  and says why.
- The repository must stay private. The snapshot travels wherever it travels.
- A deployment URL is readable by anyone holding the link, and the sign-in screen
  publishes the customer list while `PORTAL_DEMO_MODE` is on. Access protection at
  the host is the control, not the data.

**Where enforced:** `scripts/build-snapshot.ts` has one output and no flags;
`src/providers/bundled.ts` is the deployment's data path.

---

## Open questions

**OPEN-1 — What does "On hold" mean to a customer?** 63 lines across 14 orders carry
the flag and the prototype shows it. If it is a *credit* hold, showing it is right
and useful; if it is internal scheduling, the wording needs to change. PM and sales
to confirm the customer-facing phrasing.

**OPEN-2 — Neutral wording for rework and delay.** Rework currently reads "Final
quality adjustments in progress", which is neutral and carries no reason. Confirm it
is the wording the business wants.

**OPEN-3 — Contractual date source in ERPNext.** The export has a dedicated
`Contractual Date`, which is *not* `SO Submitted + Contractual Period` on 277 of 311
rows — they are independent fields. The ERPNext provider currently falls back to the
item's `delivery_date`. Confirm which field is authoritative.

**OPEN-4 — Customer-facing project names.** Projects use Arabic names such as
`575-23-وحده صحيه`. The portal shows them as they are. §8.6 leaves the display
convention open.

---

## Environment constraint (not a product decision)

Application Control on the build machine blocks unsigned native binaries under the
user profile, so `esbuild` cannot spawn — ruling out `tsx`, `vitest` and anything
built on them. Node runs TypeScript natively and `node:test` is the runner; both are
zero-dependency and behave identically in CI. `tools/alias-loader.mjs` teaches Node
the `@/*` alias so tests execute exactly the source `tsc` and Next.js see.

Consequences: TypeScript's non-erasable syntax is unavailable (no enums, parameter
properties, namespaces, decorators), and Next.js falls back to its WASM compiler,
costing a few seconds per build. Tailwind is out for the same reason — its v4 engine
is a native binary — which is moot, since transcribing the prototype's own stylesheet
is what guarantees the design matches.
