/**
 * The blacklist that `tests/security/dto-blacklist.test.ts` enforces.
 *
 * Whitelisting the DTOs is the primary control; this is the independent check that
 * proves it. The test walks every composed response — including nested objects and
 * arrays — and fails on any matching key, so a leak introduced by a future edit is
 * caught by the build rather than by a customer.
 *
 * Sources: PDF §2 (out of scope) and §7.3 (field whitelisting), plus the decisions
 * confirmed for this phase.
 */

/** Matched against every key name found anywhere in a response. */
export const FORBIDDEN_KEY_PATTERNS: readonly RegExp[] = [
  // PDF §7.3 — cost and margin on Work Order, and BOM contents.
  /cost/i,
  /margin/i,
  /^rate$/i,
  /\bbom\b/i,
  /bom_/i,
  // PDF §7.3 — supplier and warehouse data.
  /supplier/i,
  /warehouse/i,
  // PDF §7.3 — internal remarks and rework reasons.
  /remark/i,
  /rework[_-]?reason/i,
  /rework[_-]?comment/i,
  // PDF §7.3 — employee contact detail. Decision D2 permits the PM display name
  // only, so any email/phone/employee-id shaped key is forbidden.
  /email/i,
  /phone/i,
  /mobile/i,
  /employee/i,
  // Decision D3 — Backlog Amount stays internal and must never be presented as
  // financial information while there is no invoice, payment or currency data.
  /backlogamount/i,
  /openordervalue/i,
  /linevalue/i,
  // Decision D4 — On Hold stays internal until its business meaning is confirmed.
  /onhold/i,
  // Decision D6 — revision counts invite blame disputes; status only.
  /revisioncount/i,
  // Internal ERPNext document ids and internal cycle-time KPIs.
  /workorderref/i,
  /^workorder$/i,
  /itemgroup/i,
  /maindays/i,
  /reworkdays/i,
  /^t[1-8]/i,
  // Internal re-planning detail.
  /replanned/i,
]

/**
 * Values that must never appear either, regardless of the key holding them.
 *
 * Catches a leak that renames the field: an internal ERPNext work order id or a
 * `portal-api` credential would be caught here even under an innocuous key.
 */
export const FORBIDDEN_VALUE_PATTERNS: readonly RegExp[] = [
  /MFG-WO-\d{4}-\d{5}/, // ERPNext work order document name
  /^ERPNEXT_/,
  /**
   * Any email address, under any key.
   *
   * PDF §7.3 forbids employee emails, and decision D2 allows the project manager's
   * display name only. Matching on the value as well as the key means a leak that
   * renames the field — `contact`, `owner`, `assignedTo` — is still caught. No
   * customer-facing payload legitimately contains an email today.
   */
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
]

export function findForbiddenKeys(payload: unknown): string[] {
  const hits: string[] = []
  walk(payload, '', hits)
  return hits
}

function walk(node: unknown, path: string, hits: string[]): void {
  if (node === null || node === undefined) return

  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, hits))
    return
  }

  if (typeof node === 'string') {
    for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
      if (pattern.test(node)) hits.push(`${path} = value matching ${pattern}`)
    }
    return
  }

  if (typeof node !== 'object') return

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path === '' ? key : `${path}.${key}`
    for (const pattern of FORBIDDEN_KEY_PATTERNS) {
      if (pattern.test(key)) hits.push(`${childPath} (key matches ${pattern})`)
    }
    walk(value, childPath, hits)
  }
}
