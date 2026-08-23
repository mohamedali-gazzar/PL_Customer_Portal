/**
 * The Arabic side of the catalogue, and what it is not allowed to say.
 *
 * Two separate risks live here.
 *
 * The first is coverage: a key present in English and missing in Arabic renders as
 * the raw key or as English inside an RTL paragraph. The catalogue is checked as a
 * whole rather than per-screen, because the gap always appears in whichever string
 * nobody thought to look at.
 *
 * The second is vocabulary. The stage and step names come from stable internal IDs
 * — `stage.6`, `step.9` — never from the ERP report's own text, so translating them
 * is a decision made once here rather than a transliteration of whatever the SQL
 * happened to return. Some of the internal wording must not survive that step in
 * either language: the factory calls a returned panel "Rework", routes it through
 * "Pending Accounts", and settles it against an invoice. A customer is told their
 * item is under modification, and nothing about the accounting.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MESSAGES } from '@/ui/lib/messages'
import { STAGES } from '@/portal/milestones'

const en = MESSAGES.en as Record<string, string>
const ar = MESSAGES.ar as Record<string, string>

test('every English key has an Arabic string', () => {
  const missing = Object.keys(en).filter((k) => !(k in ar))
  assert.deepEqual(missing, [], `untranslated: ${missing.join(', ')}`)
})

test('no Arabic string is left as its English original', () => {
  // Latin letters in an Arabic value mean a key was copied rather than translated.
  // Product names and units are the legitimate exceptions.
  const KEEP = new Set(['brand.name', 'lang.en', 'lang.ar', 'unit.egp'])
  const untranslated = Object.keys(en).filter(
    (k) => !KEEP.has(k) && ar[k] === en[k] && /[A-Za-z]{4}/.test(en[k]!),
  )
  assert.deepEqual(untranslated, [], `still English: ${untranslated.join(', ')}`)
})

test('every stage and every step the model names has both languages', () => {
  // The binding between the two files: a stage added to the model without a key
  // added here would silently fall back to English on an Arabic screen.
  for (const spec of STAGES) {
    assert.ok(en[spec.nameKey], `${spec.nameKey} has no English`)
    assert.ok(ar[spec.nameKey], `${spec.nameKey} has no Arabic`)
    assert.ok(ar[spec.teamKey], `${spec.teamKey} has no Arabic`)
    for (const step of spec.steps) {
      assert.ok(ar[step.labelKey], `${step.labelKey} has no Arabic`)
    }
  }
})

test('the stage names come from IDs, not from the report text', () => {
  // If a stage carried the ERP string as its key, the key would read like a
  // sentence. They are numbered slots precisely so the wording can change without
  // a code change, and so Arabic is a translation rather than a lookup that misses.
  for (const spec of STAGES) {
    assert.match(spec.nameKey, /^stage\.\d+(\.\w+)?$/, `${spec.name} keyed by text`)
  }
})

test('internal factory and accounting vocabulary is in neither language', () => {
  // "Rework" is what the shop floor calls it. The customer-facing name is
  // "Item Under Modification", and the Arabic must not be a literal translation
  // back to the internal word.
  const BANNED = [
    /\brework\b/i, /\bre-work\b/i,
    /\baccounts?\b/i, /\bpending accounts\b/i,
    /\binvoice/i, /\bpayment entry\b/i, /\breceivable/i,
    /\bcredit note\b/i, /\bledger\b/i,
    /إعادة العمل/, /إعادة عمل/,           // literal "rework"
    /الحسابات/, /حساب العميل/,             // "accounts"
    /فاتورة/, /فواتير/,                     // "invoice"
    /سداد/, /دفعة/, /مستحقات/,             // payment / dues
  ]
  const offenders: string[] = []
  for (const [key, value] of Object.entries({ ...en, ...ar })) {
    for (const rx of BANNED) if (rx.test(value)) offenders.push(`${key}: ${value}`)
  }
  assert.deepEqual(offenders, [], `internal wording exposed —\n  ${offenders.join('\n  ')}`)
})

test('the modification stage is named for what the customer sees', () => {
  assert.equal(en['stage.9'], 'Item Under Modification')
  assert.ok(ar['stage.9']!.length > 0)
  assert.ok(!/[A-Za-z]/.test(ar['stage.9']!), 'the Arabic name is Arabic')
})

test('the approval wording says who is being waited on', () => {
  // The card title is Powerline's own wording and is left exactly as given. What
  // must hold in both languages is that the bar segment names the customer — the
  // whole point of the state is that the item is sitting with them, and "awaiting
  // approval" alone leaves the reader guessing whose.
  assert.match(en['bar.withYou']!, /you|your/i)
  assert.ok(ar['stage.2.waiting']!.length > 0)
  assert.ok(!/[A-Za-z]/.test(ar['bar.withYou']!), 'the Arabic segment label is Arabic')
})

test('the two dashboard figures added this round are bilingual', () => {
  for (const k of ['kpi.delivered', 'kpi.awaiting', 'kpi.awaitingWhy']) {
    assert.ok(en[k], `${k} has no English`)
    assert.ok(ar[k], `${k} has no Arabic`)
    assert.ok(!/[A-Za-z]{4}/.test(ar[k]!), `${k} is not translated`)
  }
})

test('the no-work-order wording promises nothing and blames nobody', () => {
  // It must not imply a delay, a fault, or a date that does not exist.
  const both = [en['item.noWorkOrder']!, en['item.noWorkOrderWhy']!, en['now.noProduction']!]
  for (const s of both) {
    for (const rx of [/delay/i, /late/i, /overdue/i, /error/i, /missing data/i, /problem/i]) {
      assert.ok(!rx.test(s), `"${s}" reads as a fault`)
    }
  }
  for (const k of ['item.noWorkOrder', 'item.noWorkOrderWhy', 'now.noProduction']) {
    assert.ok(ar[k] && !/[A-Za-z]{4}/.test(ar[k]!), `${k} is not translated`)
  }
})
