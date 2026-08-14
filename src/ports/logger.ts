export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void
  child(fields: Record<string, unknown>): Logger
}
