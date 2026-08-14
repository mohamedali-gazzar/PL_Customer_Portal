# Connecting the live ERP

The ERPNext provider is written and typed but has never spoken to a real instance.
This is the checklist for the first run, and the ERP-side preparation it depends on.

---

## 1. The service user

Brief §7.2. Create `portal-api@powerline.com.eg` with a dedicated role that has
**read only**, and only on these doctypes:

| Doctype | Why the portal needs it |
| --- | --- |
| Sales Order (+ Sales Order Item) | The orders and their lines — the portal's universe |
| Work Order | Item-level tracking: status, material status, planned and actual dates |
| Request For Design | Drawing approval: created, submitted, approved |
| Stock Entry | FAT evidence (`Transfer To Finished Goods`) — stage 4 |
| Delivery Note | Stage 6 |
| Sales Invoice | Stage 7 and the finance screen |
| Payment Entry | Stage 5 and the finance screen |
| File | FAT reports and other attachments |

Generate an API key and secret for that user. Put them in `ERPNEXT_API_KEY` and
`ERPNEXT_API_SECRET`. **Never an administrator token** — the whole tenant-isolation
argument rests on the portal being unable to read more than it should even if the
BFF had a bug.

### The child-table permission

Brief §9 records that a restricted user gets **403 on a direct list of a child
table** such as `Sales Order Item`. The provider therefore fetches each Sales Order
as a full document, at a concurrency of 6, rather than listing items. That is one
request per open order — around 152 today, once per cache window.

If the ERP administrator grants the role explicit child-table read, switching to a
single list query is a worthwhile optimisation. It is not required.

---

## 2. Network path

The brief leaves this open (§10, open decision 5). ERPNext must accept HTTPS from
wherever the portal runs, protected by either:

- an IP allowlist of the deployment's egress addresses, or
- a Cloudflare Tunnel in front of ERPNext.

The browser never calls ERPNext, so only the server's egress needs allowing.

---

## 3. First run

```bash
PORTAL_DATA_PROVIDER=erpnext npm run dev
```

Then compare against the Excel provider, which is the known-good reference:

1. `GET /api/health` — confirms it authenticated and returns order, line and
   customer counts.
2. Pick five orders that appear in both sources. For each, check item count,
   quantities, the current stage of every line, and the milestone dates.
3. Any disagreement is a mapping question, not a rule question — the derivation is
   shared and already verified. Look at the row the ERPNext provider built.

**Expected differences, which are not faults:**

- `Project Manager` is `null`. The export carries it; ERPNext holds it on the
  Project, which the provider does not fetch yet. One extra query.
- `On Hold` is `0`. Same reason — the flag is not on the Sales Order.
- `Contractual Period` is `null`, and the contractual date comes from the item's
  `delivery_date`. Confirm with the PM team which field is authoritative.
- Counts differ if the ERPNext query's open-order filter does not match the report's
  "open backlog" scope. The report excludes delivered lines.

---

## 4. What lights up, and what does not

The provider currently reads Sales Order, Work Order and Request For Design. That
covers milestones 1, 2, 3, 4 and 6 — the whole timeline and the whole progress
model.

Milestones 5 (pre-delivery payment) and 7 (financial clearance) stay marked
*awaiting feed*, exactly as they are today, until Sales Invoice and Payment Entry
are added. That is deliberate: an unavailable stage is honest, whereas a stage
derived from work-order status alone could never reach "Paid", so a customer who
had already paid would see a permanent payment demand.

To close them, add the two list queries to `provider.ts` and lift stages 5 and 7 in
`derive.ts` out of their `gap` state. `tests/portal/derivation.test.ts` will fail
when you do — that is correct, and the expectation should be updated deliberately
rather than the rule loosened.

---

## 5. ERP preparation still outstanding (brief §8)

These are for the ERPNext administrator, in parallel with portal work:

1. **Planned dates per stage.** FAT and delivery have no planned-date field. Add
   `custom_planned_fat_date` and `custom_planned_delivery_date` on Work Order, or
   agree offsets from `expected_delivery_date`. The timeline draws their markers
   automatically once they exist.
2. **FAT report location.** Agree one home for the customer-facing PDF —
   recommended: attached to the Work Order — and make it an SOP.
3. **Payment allocation discipline.** Stage 5 only works if Payment Entries are
   allocated to the correct Sales Order / Invoice references.
4. **Contact emails.** Portal logins are provisioned from Customer → Contact. Some
   sample data carries placeholder addresses; clean these before onboarding pilots.
5. **`custom_item_status` on Work Order** is unused. Leave it that way — the portal
   computes status from documents, and a hand-maintained field would drift.
6. **Customer-facing project names.** Projects use Arabic names. The portal shows
   them as they are; if a display convention is agreed (SO number + PO + English
   short name), it applies in one place.

---

## 6. Keeping it live

Cache invalidation is ready but not yet wired to a trigger. `invalidateSnapshot()`
drops the cached snapshot; the intended caller is an ERPNext **webhook** on submit
of Work Order, Stock Entry, Delivery Note, Sales Invoice, Payment Entry and RFD, so
a customer sees a milestone move within seconds instead of at the end of the refresh
window. Without it, the 5-minute window is the fallback.
