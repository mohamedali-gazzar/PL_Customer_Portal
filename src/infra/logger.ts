import type { Logger, LogLevel } from '@/ports/logger'

/**
 * One structured line per event.
 *
 * PDF §7.5 requires an audit log of every customer request. Structured JSON keeps
 * that queryable, and the tenant is only ever logged as a hash — a plaintext
 * tenant field would turn the request log into a customer list.
 */
export class JsonLogger implements Logger {
  private readonly base: Record<string, unknown>

  constructor(base: Record<string, unknown> = {}) {
    this.base = base
  }

  log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level,
      msg: message,
      ...this.base,
      ...fields,
    })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  child(fields: Record<string, unknown>): Logger {
    return new JsonLogger({ ...this.base, ...fields })
  }
}

export const NULL_LOGGER: Logger = {
  log: () => {},
  child: () => NULL_LOGGER,
}
