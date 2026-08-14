/**
 * Everything the server reads from the environment, resolved once, in one place.
 *
 * Configuration is validated at boot rather than at first use, so a missing secret
 * is a startup failure with a sentence explaining it — not a 500 three screens into
 * a customer's session.
 *
 * The defaults are chosen so a deployment works with nothing configured except the
 * session secret. Every value goes through `str()`, which treats blank as absent: a
 * variable defined in a hosting dashboard with an empty value is one of the
 * commonest real deployment states, and `??` alone does not catch it, because
 * `'' ?? 'x'` is `''`.
 */

export type DataProviderName = 'bundled' | 'xlsx' | 'erpnext'
export type CacheDriverName = 'memory' | 'upstash'

export interface PortalConfig {
  readonly production: boolean
  readonly provider: DataProviderName
  readonly excelPath: string
  readonly cacheDriver: CacheDriverName
  readonly upstash: { readonly url: string; readonly token: string } | null
  readonly sessionSecret: string
  readonly sessionTtlSeconds: number
  readonly snapshotFreshSeconds: number
  readonly snapshotStaleSeconds: number
  /**
   * The sign-in customer picker, and the statistics on the sign-in screen.
   *
   * On by default, because it is currently the only way into the portal: the data
   * has no contact records, so there is no credential to check. Set
   * `PORTAL_DEMO_MODE=0` once logins are provisioned from ERPNext contacts — the
   * picker disappears and the sign-in screen stops publishing figures.
   */
  readonly demoMode: boolean
  readonly erpnext: ErpNextConfig | null
  readonly staffEmailDomain: string
}

export interface ErpNextConfig {
  readonly baseUrl: string
  readonly apiKey: string
  readonly apiSecret: string
  readonly timeoutMs: number
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** A development-only session secret, used when none is configured. */
const DEV_SECRET = 'powerline-portal-local-development-secret-not-for-production'

/** A blank environment variable means "not set", not "set to empty". */
function str(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  const v = str(raw)
  if (v === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

function int(raw: string | undefined, fallback: number): number {
  const n = Number(str(raw))
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

/**
 * Which data provider to use.
 *
 * `snapshot` is retired. It fetched a derived snapshot over HTTPS, and existed
 * only while the data could not travel with the build; the snapshot is now
 * committed, so the same file ships with the code. Deployments configured for it
 * are migrated here rather than broken, because a stale variable in a hosting
 * dashboard would otherwise keep overriding the default indefinitely — silently,
 * and with data nobody intended to serve.
 *
 * An unrecognised value is still fatal. Falling back on anything we do not
 * recognise would turn `erpnex` into "quietly serve last month's spreadsheet",
 * which is the failure this codebase exists to prevent.
 */
function resolveProvider(raw: string | undefined): DataProviderName {
  const name = (raw ?? 'bundled').toLowerCase()
  if (name === 'bundled' || name === 'xlsx' || name === 'erpnext') return name

  if (name === 'snapshot') {
    console.warn(
      '[portal] PORTAL_DATA_PROVIDER=snapshot is retired and is being ignored. The portal ' +
        'now serves content/portal-snapshot.json, which ships with the build. Remove ' +
        'PORTAL_DATA_PROVIDER and PORTAL_SNAPSHOT_URL from this environment.',
    )
    return 'bundled'
  }

  throw new ConfigError(
    `PORTAL_DATA_PROVIDER must be one of these, not "${name}":\n` +
      `  bundled — the snapshot committed at content/portal-snapshot.json (default)\n` +
      `  xlsx    — derive from the backlog export on local disk\n` +
      `  erpnext — read the live ERP`,
  )
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PortalConfig {
  const production = env.NODE_ENV === 'production'

  const provider = resolveProvider(str(env.PORTAL_DATA_PROVIDER))

  const cacheDriver = (str(env.PORTAL_CACHE_DRIVER) ?? 'memory').toLowerCase()
  if (cacheDriver !== 'memory' && cacheDriver !== 'upstash') {
    throw new ConfigError(`PORTAL_CACHE_DRIVER must be "memory" or "upstash", not "${cacheDriver}".`)
  }

  const upstashUrl = str(env.UPSTASH_REDIS_REST_URL)
  const upstashToken = str(env.UPSTASH_REDIS_REST_TOKEN)
  if (cacheDriver === 'upstash' && !(upstashUrl && upstashToken)) {
    throw new ConfigError(
      'PORTAL_CACHE_DRIVER=upstash needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    )
  }

  const sessionSecret = str(env.PORTAL_SESSION_SECRET)
  if (production && (!sessionSecret || sessionSecret.length < 32)) {
    throw new ConfigError(
      'PORTAL_SESSION_SECRET must be at least 32 random characters in production.\n' +
        'It signs the session cookie. Without it the cookie is signed with a value that ' +
        'is published in this repository, and anyone could mint one naming any customer ' +
        'and read that customer\'s orders. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    )
  }

  const erpBase = str(env.ERPNEXT_BASE_URL)
  const erpKey = str(env.ERPNEXT_API_KEY)
  const erpSecret = str(env.ERPNEXT_API_SECRET)
  if (provider === 'erpnext' && !(erpBase && erpKey && erpSecret)) {
    throw new ConfigError(
      'PORTAL_DATA_PROVIDER=erpnext needs ERPNEXT_BASE_URL, ERPNEXT_API_KEY and ' +
        'ERPNEXT_API_SECRET. Use the dedicated read-only portal service user from ' +
        'brief §7.2 — never an administrator token.',
    )
  }

  return {
    production,
    provider,
    excelPath: str(env.EXCEL_BACKLOG_PATH) ?? 'data/backlog.xlsx',
    cacheDriver,
    upstash: upstashUrl && upstashToken ? { url: upstashUrl, token: upstashToken } : null,
    sessionSecret: sessionSecret ?? DEV_SECRET,
    sessionTtlSeconds: int(env.PORTAL_SESSION_TTL_SECONDS, 12 * 60 * 60),
    snapshotFreshSeconds: int(env.PORTAL_SNAPSHOT_FRESH_SECONDS, 5 * 60),
    snapshotStaleSeconds: int(env.PORTAL_SNAPSHOT_STALE_SECONDS, 30 * 60),
    demoMode: bool(env.PORTAL_DEMO_MODE, true),
    erpnext:
      erpBase && erpKey && erpSecret
        ? {
            baseUrl: erpBase.replace(/\/+$/, ''),
            apiKey: erpKey,
            apiSecret: erpSecret,
            timeoutMs: int(env.ERPNEXT_TIMEOUT_MS, 15_000),
          }
        : null,
    staffEmailDomain: (str(env.PORTAL_STAFF_EMAIL_DOMAIN) ?? 'powerline.com.eg').toLowerCase(),
  }
}

let cached: PortalConfig | null = null

export function config(): PortalConfig {
  if (cached === null) cached = loadConfig()
  return cached
}

/** Test support: forget the memoised configuration. */
export function resetConfig(): void {
  cached = null
}
