/**
 * The project-manager directory.
 *
 * This is hand-maintained reference data copied out of an HR sheet, which makes it
 * the kind of file that rots quietly: a typo in an address, a number that lost its
 * leading digit, an entry nobody noticed was orphaned. None of that throws — it
 * just puts a dead link in front of a customer.
 *
 * So the shape is pinned here, and the lookup's failure behaviour with it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PROJECT_MANAGERS, projectManager, telHref } from '@/portal/people'

test('every entry carries a name, a title and a Powerline address', () => {
  for (const [key, p] of Object.entries(PROJECT_MANAGERS)) {
    assert.ok(p.name.trim().length > 0, `${key}: no name`)
    assert.ok(p.title.trim().length > 0, `${key}: no title`)
    assert.match(p.email, /^[^\s@]+@powerline\.com\.eg$/, `${key}: not a Powerline address`)
    assert.equal(p.email, p.email.toLowerCase(), `${key}: address should be lower case`)
  }
})

test('the key is the short name the export uses, and it matches the address', () => {
  // This is what confirmed each pairing when the directory was transcribed: the
  // ERP's short form and the email local part are the same handle. If a future
  // entry breaks that, it is far more likely to be a mis-paired row than a real
  // exception, and it should be looked at rather than assumed.
  for (const [key, p] of Object.entries(PROJECT_MANAGERS)) {
    const local = p.email.split('@')[0]!
    const fromKey = key.toLowerCase().replace(/\s+/g, '.')
    assert.equal(local, fromKey, `${key}: address does not follow from the export name`)
  }
})

test('a mobile is a full Egyptian number, not one missing its leading zero', () => {
  // The source sheet stores them as ten digits — 1050276003 — because a spreadsheet
  // ate the leading zero. Transcribed straight in, every tel: link would dial a
  // number one digit short.
  for (const [key, p] of Object.entries(PROJECT_MANAGERS)) {
    if (!p.mobile) continue
    const digits = p.mobile.replace(/\D/g, '')
    assert.equal(digits.length, 11, `${key}: ${digits.length} digits, expected 11`)
    assert.match(digits, /^01[0125]/, `${key}: not an Egyptian mobile prefix`)
  }
})

test('the tel: link is dialable from outside Egypt', () => {
  assert.equal(telHref('010 5027 6003'), 'tel:+201050276003')
  // Already-grouped or spaced input must not change the result.
  assert.equal(telHref('01050276003'), 'tel:+201050276003')
})

test('an unknown or absent PM resolves to null rather than throwing', () => {
  // "Service Team" appears on one line of the current export and is not a person.
  assert.equal(projectManager('Service Team'), null)
  assert.equal(projectManager(null), null)
  assert.equal(projectManager(undefined), null)
  assert.equal(projectManager(''), null)
})

test('lookup is exact, so a near-miss fails visibly rather than mis-attributing', () => {
  // Fuzzy matching here would eventually hand one PM's phone number out under
  // another PM's name, which is worse than showing no contact at all.
  assert.equal(projectManager('sherif ali'), null)
  assert.equal(projectManager('Sherif'), null)
  assert.ok(projectManager('Sherif Ali'))
})
