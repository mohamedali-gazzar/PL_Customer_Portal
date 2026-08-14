/**
 * The session cookie is the portal's only trust boundary.
 *
 * Brief §7.1 says the customer is resolved from the session and never from a
 * request parameter. That guarantee reduces entirely to one question: can a cookie
 * be forged? These tests are the answer, and they are the reason no route needs to
 * defend itself individually.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { issueSession, readSession } from '@/server/session'

const SECRET = 'a-test-secret-of-sufficient-length-for-hmac'
const TTL = 3600

test('a session round-trips', () => {
  const { value } = issueSession({ role: 'customer', customer: 'Acme', email: 'a@acme.test' }, SECRET, TTL)
  const session = readSession(value, SECRET)
  assert.equal(session?.role, 'customer')
  assert.equal(session?.customer, 'Acme')
})

test('the tenant cannot be swapped by editing the cookie', () => {
  const { value } = issueSession({ role: 'customer', customer: 'Acme', email: 'a@acme.test' }, SECRET, TTL)
  const [payload, signature] = value.split('.')

  // Decode, rewrite the customer, re-encode — the attack a curious customer with
  // devtools would actually try.
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
  claims.customer = 'A Competitor'
  const forged = `${Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')}.${signature}`

  assert.equal(readSession(forged, SECRET), null, 'a re-signed-payload cookie must be rejected')
})

test('a customer cannot promote themselves to staff', () => {
  const { value } = issueSession({ role: 'customer', customer: 'Acme', email: 'a@acme.test' }, SECRET, TTL)
  const [payload, signature] = value.split('.')
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
  claims.role = 'staff'
  const forged = `${Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')}.${signature}`

  assert.equal(readSession(forged, SECRET), null)
})

test('a cookie signed with another secret is rejected', () => {
  const { value } = issueSession({ role: 'staff', customer: null, email: 'pm@powerline.com.eg' }, 'other-secret', TTL)
  assert.equal(readSession(value, SECRET), null)
})

test('an expired session is rejected', () => {
  const { value } = issueSession({ role: 'customer', customer: 'Acme', email: 'a@acme.test' }, SECRET, 60)
  const twoHoursLater = () => Date.now() + 2 * 60 * 60 * 1000
  assert.equal(readSession(value, SECRET, twoHoursLater), null)
})

test('a staff session carries no tenant, so it can never be mistaken for one customer', () => {
  const { session } = issueSession({ role: 'staff', customer: 'Acme', email: 'pm@powerline.com.eg' }, SECRET, TTL)
  assert.equal(session.customer, null)
})

test('a customer session with no tenant is invalid rather than unscoped', () => {
  // The failure that matters: an empty tenant must not be read as "all tenants".
  const claims = { role: 'customer', customer: null, email: 'x', iat: 0, exp: Math.floor(Date.now() / 1000) + 999 }
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')

  assert.equal(readSession(`${payload}.${signature}`, SECRET), null)
})

test('malformed cookies are rejected without throwing', () => {
  for (const bad of ['', 'nonsense', 'a.b', '....', 'eyJ9.zzz']) {
    assert.equal(readSession(bad, SECRET), null, `"${bad}" must not authenticate`)
  }
})
