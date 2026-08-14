/**
 * A small, deliberately boring ERPNext REST client.
 *
 * Brief §7.2: it authenticates as the dedicated read-only portal service user via
 * `token key:secret`, never as an administrator. It only ever reads.
 *
 * The credential lives here and is never handed upward, so no calling code can
 * accidentally forward it or log it. The browser never sees ERPNext at all — the
 * whole point of the BFF.
 */

import type { ErpNextConfig } from '@/server/config'

export class ErpNextError extends Error {
  readonly status: number
  readonly doctype: string

  constructor(doctype: string, status: number, detail: string) {
    super(`ERPNext ${doctype} request failed with ${status}: ${detail}`)
    this.name = 'ErpNextError'
    this.status = status
    this.doctype = doctype
  }
}

export type Filter = readonly [field: string, operator: string, value: unknown]

export interface ListQuery {
  readonly fields?: readonly string[]
  readonly filters?: readonly Filter[]
  readonly orderBy?: string
  /** Page size per request. ERPNext caps this; 500 is a safe working value. */
  readonly pageSize?: number
  /** Stop after this many records. Guards against an unbounded pull. */
  readonly limit?: number
}

export class ErpNextClient {
  private readonly cfg: ErpNextConfig

  constructor(cfg: ErpNextConfig) {
    this.cfg = cfg
  }

  private headers(): HeadersInit {
    return {
      // ERPNext's own scheme: a key/secret pair, not a bearer JWT.
      Authorization: `token ${this.cfg.apiKey}:${this.cfg.apiSecret}`,
      Accept: 'application/json',
    }
  }

  private async request<T>(doctype: string, url: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs)
    try {
      const res = await fetch(url, { headers: this.headers(), signal: controller.signal, cache: 'no-store' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        // 403 on a child table is the documented symptom of a restricted role
        // (brief §9); say so rather than leaving a bare status code.
        const hint =
          res.status === 403
            ? ' — the portal service role is missing read permission on this doctype. ' +
              'For child tables, fetch the parent document instead.'
            : ''
        throw new ErpNextError(doctype, res.status, body.slice(0, 400) + hint)
      }
      return (await res.json()) as T
    } catch (cause) {
      if (cause instanceof ErpNextError) throw cause
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw new ErpNextError(doctype, 504, `timed out after ${this.cfg.timeoutMs}ms`)
      }
      throw new ErpNextError(doctype, 0, cause instanceof Error ? cause.message : String(cause))
    } finally {
      clearTimeout(timer)
    }
  }

  /** Fetch a list, following pagination until exhausted or `limit` is reached. */
  async list<T extends Record<string, unknown>>(doctype: string, query: ListQuery = {}): Promise<T[]> {
    const pageSize = query.pageSize ?? 500
    const out: T[] = []

    for (let start = 0; ; start += pageSize) {
      const params = new URLSearchParams()
      if (query.fields) params.set('fields', JSON.stringify(query.fields))
      if (query.filters?.length) params.set('filters', JSON.stringify(query.filters))
      if (query.orderBy) params.set('order_by', query.orderBy)
      params.set('limit_start', String(start))
      params.set('limit_page_length', String(pageSize))

      const url = `${this.cfg.baseUrl}/api/resource/${encodeURIComponent(doctype)}?${params}`
      const body = await this.request<{ data?: T[] }>(doctype, url)
      const page = body.data ?? []
      out.push(...page)

      if (page.length < pageSize) break
      if (query.limit !== undefined && out.length >= query.limit) break
    }

    return query.limit === undefined ? out : out.slice(0, query.limit)
  }

  /** Fetch one full document, including its child tables. */
  async get<T extends Record<string, unknown>>(doctype: string, name: string): Promise<T> {
    const url = `${this.cfg.baseUrl}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
    const body = await this.request<{ data: T }>(doctype, url)
    return body.data
  }
}

/**
 * Run tasks with bounded concurrency.
 *
 * Pulling one full Sales Order per open order is the documented way to read child
 * tables with a restricted role. Doing that unthrottled would open 150+ sockets
 * against the production ERP at once — precisely the load the cache exists to
 * prevent.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  })

  await Promise.all(workers)
  return results
}
