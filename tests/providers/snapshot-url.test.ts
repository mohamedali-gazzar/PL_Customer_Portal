/**
 * The snapshot provider is the portal's data path in a hosted deployment, and its
 * failure modes are all quiet ones: a URL that returns a login page, a bucket that
 * 404s politely with an empty object, a token that expired.
 *
 * Every one of those parses as JSON. If any were accepted, the result would be a
 * portal where every customer's orders had silently vanished — which reads to the
 * customer as "nothing has happened on my order", the exact failure this codebase
 * exists to prevent. So the provider refuses anything it cannot recognise, and
 * these tests are that refusal.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'

import { loadSnapshotFromUrl, SnapshotSourceError } from '@/providers/snapshot-url'

/** Serve one canned response and return its URL. */
async function serving(
  body: string,
  status = 200,
  contentType = 'application/json',
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': contentType })
    res.end(body)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('no address')
  return {
    url: `http://127.0.0.1:${address.port}/snapshot.json`,
    close: async () => {
      server.close()
      await once(server, 'close')
    },
  }
}

const VALID = JSON.stringify({
  meta: { exportDate: '2026-08-11', rows: 1, orders: 1, customers: 1 },
  items: [{ id: 0, cust: 'Acme' }],
  orders: [{ so: 'SO-1', cust: 'Acme' }],
  customers: [{ name: 'Acme' }],
})

async function expectRejection(body: string, status: number, because: string): Promise<string> {
  const s = await serving(body, status)
  try {
    await loadSnapshotFromUrl(s.url, 5000)
    assert.fail(`${because} was accepted`)
  } catch (e) {
    assert.ok(e instanceof SnapshotSourceError, `expected SnapshotSourceError, got ${e}`)
    return e.message
  } finally {
    await s.close()
  }
}

test('a valid snapshot loads', async () => {
  const s = await serving(VALID)
  try {
    const snapshot = await loadSnapshotFromUrl(s.url, 5000)
    assert.equal(snapshot.items.length, 1)
    assert.equal(snapshot.meta.exportDate, '2026-08-11')
  } finally {
    await s.close()
  }
})

test('an empty snapshot is refused rather than served as an empty portal', async () => {
  const body = JSON.stringify({ meta: { exportDate: '2026-08-11' }, items: [], orders: [], customers: [] })
  const message = await expectRejection(body, 200, 'a snapshot with no item lines')
  assert.match(message, /no item lines/)
})

test('a document that is merely valid JSON is refused', async () => {
  // What a misdirected URL most often returns.
  await expectRejection('{}', 200, 'an empty object')
  await expectRejection(JSON.stringify({ error: 'not found' }), 200, 'an error envelope')
  await expectRejection(JSON.stringify([1, 2, 3]), 200, 'an array')
})

test('an HTML login page is refused', async () => {
  const s = await serving('<!doctype html><title>Sign in</title>', 200, 'text/html')
  try {
    await assert.rejects(() => loadSnapshotFromUrl(s.url, 5000), SnapshotSourceError)
  } finally {
    await s.close()
  }
})

test('an authentication failure says what to fix', async () => {
  const message = await expectRejection('denied', 403, 'a 403')
  assert.match(message, /403/)
  assert.match(message, /readable by the deployment/)
})

test('a 404 points at the configuration', async () => {
  const message = await expectRejection('nope', 404, 'a 404')
  assert.match(message, /PORTAL_SNAPSHOT_URL/)
})

test('an unreachable host fails with the URL in the message', async () => {
  // Port 1 on loopback: nothing listens there.
  await assert.rejects(
    () => loadSnapshotFromUrl('http://127.0.0.1:1/snapshot.json', 2000),
    (e: unknown) => e instanceof SnapshotSourceError && /127\.0\.0\.1:1/.test(e.message),
  )
})
