/**
 * Configuration is read at boot, so a mistake here is a deployment that serves the
 * wrong data or refuses to start. Both have happened; these are the regressions.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadConfig, ConfigError } from '@/server/config'

/** A deliberately empty environment: every test states what it depends on. */
const base = { NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv

test('with nothing configured, the portal serves the snapshot that ships with it', () => {
  const cfg = loadConfig({ ...base })
  assert.equal(cfg.provider, 'bundled')
  assert.equal(cfg.cacheDriver, 'memory')
  assert.equal(cfg.demoMode, true, 'the customer picker is currently the only way in')
})

test('a blank variable means unset, not empty', () => {
  // A hosting dashboard entry left empty defeated `?? default` and stopped the app
  // booting at all. `'' ?? "bundled"` is `''`.
  const cfg = loadConfig({
    ...base,
    PORTAL_DATA_PROVIDER: '',
    PORTAL_CACHE_DRIVER: '   ',
    EXCEL_BACKLOG_PATH: '',
  })
  assert.equal(cfg.provider, 'bundled')
  assert.equal(cfg.cacheDriver, 'memory')
  assert.equal(cfg.excelPath, 'data/backlog.xlsx')
})

test('the retired "snapshot" provider migrates to bundled rather than overriding it', () => {
  // A live deployment carried this variable pointing at an anonymised file, and it
  // kept winning over the default long after the file it named was obsolete.
  const cfg = loadConfig({
    ...base,
    PORTAL_DATA_PROVIDER: 'snapshot',
    PORTAL_SNAPSHOT_URL: 'https://example.invalid/old.json',
  })
  assert.equal(cfg.provider, 'bundled')
})

test('an unrecognised provider is still fatal', () => {
  // Falling back on anything unknown would turn a typo into "quietly serve last
  // month's spreadsheet" — exactly what must not happen once ERPNext is live.
  assert.throws(() => loadConfig({ ...base, PORTAL_DATA_PROVIDER: 'erpnex' }), ConfigError)
  assert.throws(() => loadConfig({ ...base, PORTAL_DATA_PROVIDER: 'postgres' }), ConfigError)
})

test('production refuses to start without a session secret', () => {
  assert.throws(
    () => loadConfig({ ...base, NODE_ENV: 'production' }),
    (e: unknown) => e instanceof ConfigError && /PORTAL_SESSION_SECRET/.test(e.message),
  )
  assert.throws(
    () => loadConfig({ ...base, NODE_ENV: 'production', PORTAL_SESSION_SECRET: 'too-short' }),
    ConfigError,
  )
  const ok = loadConfig({
    ...base,
    NODE_ENV: 'production',
    PORTAL_SESSION_SECRET: 'x'.repeat(32),
  })
  assert.equal(ok.production, true)
})

test('the ERP provider will not start half-configured', () => {
  assert.throws(
    () => loadConfig({ ...base, PORTAL_DATA_PROVIDER: 'erpnext', ERPNEXT_BASE_URL: 'https://erp.local' }),
    ConfigError,
  )
  const cfg = loadConfig({
    ...base,
    PORTAL_DATA_PROVIDER: 'erpnext',
    ERPNEXT_BASE_URL: 'https://erp.local/',
    ERPNEXT_API_KEY: 'key',
    ERPNEXT_API_SECRET: 'secret',
  })
  assert.equal(cfg.erpnext?.baseUrl, 'https://erp.local', 'the trailing slash is normalised away')
})

test('upstash needs both halves of its credential', () => {
  assert.throws(
    () => loadConfig({ ...base, PORTAL_CACHE_DRIVER: 'upstash', UPSTASH_REDIS_REST_URL: 'https://x' }),
    ConfigError,
  )
})
