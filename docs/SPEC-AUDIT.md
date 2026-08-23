# Audit — current portal against the Customer Production Timeline spec

Written before any code changed, from the spec HTML, `PM_Phase_Model_Master.xlsx`,
and the two 22 August exports. Row counts and distributions below are measured from
those files, not quoted from the spec.

## 1. What the spec asks for that already exists

The addendum's own list is accurate. Verified present in the code:

| Spec expectation | Where it lives |
|---|---|
| Per-item milestone timeline, not five stages | `src/portal/journey.ts` — 9 levels |
| Done date + duration per milestone | `journeyOf` → `from`/`to`/`days` |
| Running counter on the active milestone | same, `state === 'active'` branch |
| Gantt bar per item with a customer-is-blocking band | `src/ui/components/Timeline.tsx` |
| Material status badges incl. a "No work order" empty state | `src/ui/views/Projects.tsx` item table |
| Contract vs open backlog, PM contact, EN/AR, light/dark | shipped |
| Only one milestone ever `active` | `journeyOf` frontier logic |
| A level with no timestamp but a finished successor reads "Not recorded" | `journeyOf` monotonic pass |

That last one matters for Delta 4: it is exactly the behaviour the Delivered report
needs, and it is already written and tested.

## 2. What must change

| # | Delta | Current state | Work |
|---|---|---|---|
| 1 | 9 milestones → 12 | `JOURNEY_LABELS` has 9 | Split 5 and 9, insert 10 |
| 2 | Wire milestones to date columns | Chain of 9 timestamps, positional | Needs 20+ new columns |
| 3 | Headline status from the report | `deriveItem` computes it locally | Read `current_*`, delete local rule |
| 4 | Add the Delivered report | Open Backlog only | Second source, concatenated |
| 5 | Weighted progress | `pct` = mean of measurable stages | Replace with the weight table |
| 6 | Partial delivery + multi-WO | `deliv` carried, never labelled | Label + badge |
| 7 | Three Arabic strings | — | Add |

### The column gap is the bulk of the work

The loader validates the export header against `COLUMNS` and refuses to run on a
mismatch — deliberate, and it will fire here. The current map declares **58**
columns; the new Open Backlog export has **109**. Newly required:

`SO Created On`, `Rel Approved`, `Main WO Submitted On`, `Main Not/Partially/Available On`,
`Main Production Started`, `Main FAT Success`, `Main Testing Started/Touchup/Rejected/Completed On`,
the 17 Rework equivalents, `Delivery Notes`, `DN Workflow State/Status/Docstatus`,
`DN Created On`, `Delivered On`, `DN Qty`, the 7 invoice/payment columns,
`Step Code`, `Stage Since`, `T9`, `T10`, and the five `Current *` columns.

## 3. Conflicts between the spec and the attached data

These are reported rather than worked around.

### 3.1 The Delivered export does not match its own specification — blocking for part of Delta 2

`PM_Phase_Model_Master.xlsx`, sheet *6 Reports*, states the Delivered report has
**"109 columns — identical"** to Open Backlog. The attached file has **59**, and is
missing every column Delta 2 needs to complete milestones 3, 4, 5, 8, 9 and 11:

- no `Rel Approved` (milestone 3)
- no `Main WO Submitted On` (4)
- no material-status dates (5)
- no `Main Testing *` (8)
- no `Main FAT Success` (9)
- no `DN Workflow State` / `DN Created On` / `Delivered On` (11)
- no `Current Stage #`, `Current Step`, `Step Code`, `Stage Since`, `Days In Current Stage` (Delta 3)

It does carry `Delivered` (a date, filled on all 788 rows), `Main Material Ready`,
`Main Closed` and `Rework Closed`.

**How this is handled without inventing data.** Sheet *2 Current Stage Ladder* and
sheet *6* both state that every Delivered row is, by construction, stage 11
(Delivered) — the report's filter is `delivered_qty >= qty`. So the headline status
is derivable for these rows without the `current_*` columns, and does not need to be
guessed. For the milestones whose dates are absent, the existing monotonic rule
applies: a level with no timestamp but a finished successor reads **"Not recorded"**,
never a fabricated date and never "not done". No value is invented anywhere.

**What Powerline should fix:** re-export Delivered with the full 109-column query so
delivered items show real milestone dates instead of "Not recorded".

### 3.2 Delivered has no backlog or remaining-quantity column

Open Backlog carries `Backlog Amount` and `Remaining Qty`; Delivered carries
`Delivered Amount` and neither of the others. This is coherent — a delivered line has
no backlog — and the portal derives `remain = qty - deliv` and `backlog = 0` for
these rows. Worth stating because the unit rate is currently derived as
`backlog ÷ remaining`, which is undefined here; `Delivered Amount ÷ delivered qty`
is used instead.

### 3.3 "Partial deliveries look finished" (spec §9.8) does not reproduce in this data

Delta 6 asks for a "Partially delivered" label where `0 < delivered_qty < so_qty`.
Measured: **0 of 788** Delivered rows are partial, and in Open Backlog only 13 rows
have any `Delivered On` at all. The rule is implemented as specified, but it is
currently unexercised by real data — so it is covered by unit tests rather than by
the snapshot.

### 3.4 Milestone 11's naming is unconfirmed

The report's step is `Delivery Note Issued - Pending Accounts`. The spec proposes
**"Dispatch approvals"** and says to confirm with Powerline before shipping. Used as
proposed; flagged as an open decision, not a settled one.

### 3.5 Two decisions the spec leaves to Powerline

- Work Order numbers are visible today (`MFG-WO-2026-01522`) while §8 lists them as
  internal. Left visible — changing it is a product decision, not a migration step.
- Phase 1 vs Phase 2: this portal reads a committed snapshot built from the exports.
  Unchanged here.

### 3.6 Twenty-five lines have a testing-completed date but no testing-started date

Found while verifying the build, not stated in the spec. The ladder promotes an item
to Quality on `main_testing_started_on`; these 25 lines have `main_testing_completed_on`
filled with that start column empty, so the ladder correctly leaves them at
Manufacturing while a later column is already populated. Affected orders include
SO-24-00314, SO-25-00482 and SO-25-00519.

The portal follows the ladder — Delta 3 makes it the authority — and does not show a
date against a milestone the item has not reached. Rendering it would put
"Not started · Done 10 Apr 25" on one card. **Worth an ERP-side look:** either the
start timestamp is not being written, or the ladder should also promote on the
completion column.

## 3b. The card model, and what is deliberately not drawn

The timeline is a scrolling strip of **stage cards**, each showing the stage number,
its name, the responsible team, and its steps with their dates — the shape in
Mockup 1 and the reference table. A stage is owned by one team and can take several
steps to clear; the earlier flat list of milestones lost that.

Cards are **renumbered 1..n over the stages actually drawn**. The report's own
numbers run 0–11 with Financial Check at 10; once that is hidden, and a modification
is absent as it usually is, the badges would read 0,1,2,3,4,5,6,7,8,11 and invite the
question of what happened to 9 and 10. One helper — `stagePosition` — produces the
number for the card badge, the header line and the item table, so the three cannot
disagree about the same panel.

Two things the reference lists are not rendered:

| Not drawn | Why |
|---|---|
| Stage 10, Financial Check | Powerline's instruction. Items the report places there show as active on Delivery Readiness, the next visible stage — otherwise the 119 items sitting there would have no active card at all. |
| Step 15, Paid | The sheet marks it "Show to Customer: NO". Finance is a later phase and it is order-level, not per item. |
| Idle "Waiting for…" step 0 | Powerline's instruction. Every step on a card now has a real number and a column behind it. |

**Step 12, FAT Invitation, is rendered at Powerline's request** and sits before FAT
Success. It has no field of its own — spec §9.6 — so the reference stands it on FAT
Success's date, and the two therefore show the same day. That is faithful to the
reference but not informative: **it needs a real field before it means anything more
than "FAT happened".**

A clean panel therefore shows **10 cards**; one that has been through a modification
shows **11**. Measured across the snapshot: 1137 items at 10, 166 at 11.

Removing stage 10 does not disturb progress. The weights stay indexed by report
stage, so the percentage is continuous whether or not the card is drawn.

## 3c. The timeline bar

Segments are **stage families**, in the spec's own colours, taken from the mockups
rather than approximated:

| Family | Stages | Colour |
|---|---|---|
| Not started | 0 | `#B8B2A7` |
| Drawings | 1–3 | `#5C6B57` |
| Material | 4–5 | `#7A5230` |
| Manufacturing | 6 | `#96602F` |
| Quality + FAT | 7–8 | `#A87038` |
| Item Under Modification | 9 | `#C44A05` — no colour is given for this in the spec |
| Ready / Delivered | 11 | `#2E7D53` |

Eleven bands is a barcode; five is a shape you can read at a glance. Finished stages
of one family fold together and take the family's name — "Drawings · 33d" is
Drawing Creation, Drawings Approval and Design Verification added up.

**A band that covers only one stage keeps that stage's own name.** Both readings are
in the spec — Mockup 2 says "Drawing Creation · 16d" where only that stage has
finished, Mockup 3 says "Drawings · 33d" where all three have — and what separates
them is how much the band actually covers.

**The running band is never folded in**, however much it covers. It answers "where is
my panel", and both mockups name it for its own stage: "Drawings Approval · with you
· 6d", "Financial Check · 16d".

The cards still name every stage individually. The bar speaks in families; the strip
above it speaks in stages. It was previously cut by T-phase, the
ERP's measurement vocabulary, which did not line up with the cards and made the
reader translate between two views of the same fortnight.

The segment the customer is holding says so: `Waiting for approval to proceed ·
with you · 16d`. Four items are in that state today.

**A segment runs from where the previous stage ended to where this one ended** — the
elapsed time the stage is answerable for. Taking each stage's own first date instead
made every stage that records a single date zero pixels wide and drew an empty bar
for all 647 delivered items; that was caught by verifying against the snapshot
rather than by looking at one screen.

Where the stages in between recorded nothing, their time is absorbed by the stage
that closed it. We know the work was finished by that date and not when it began,
and attributing the gap to the stage that ended it is the one reading that invents
no boundary. Dates are also forced monotonic first, so a bar can never be drawn
running backwards.

Under the bar, the line the spec specifies:
`Contractual period 60 days · contractual date set once drawings are approved`
where no contractual date exists yet, and
`Contractual date 30 Aug 26 · 8 days remaining` where it does.

Measured across the snapshot: **0** items with an empty bar, **0** segments running
backwards, **0** overlaps, **0** items where the open segment is not the last.

## 4. Measured distribution — the build target

515 open rows, matching sheet *2* exactly. This is the check the implementation must
reproduce.

| Report stage | Portal milestone | Rows |
|---|---|---|
| 0 Order Creation | 1 Order placed | 79 |
| 1 Drawing Creation | 2 Preparing drawings | 40 |
| 2 Drawings Approval | 3 Waiting for approval | 4 |
| 3 Design Verification | 4 Releasing to production | 47 |
| 4 Material Planning | 5 Checking material | 91 |
| 5 Material Readiness | 6 Gathering material | 2 |
| 6 Manufacturing | 7 Manufacturing | 50 |
| 7 Quality | 8 Quality check | 55 |
| 8 FAT | 9 FAT | 12 |
| 9 Rework | 10 Item under modification | 2 |
| 10 Financial Check | 11 Dispatch approvals | 119 |
| 11 Delivery Readiness | 12 Delivery | 14 |

Report stage `n` maps to portal milestone `n + 1` throughout.

Also measured: **63 of 515** open rows are on hold, **133** have a DN workflow state,
**788** delivered rows across 2026 to date.
