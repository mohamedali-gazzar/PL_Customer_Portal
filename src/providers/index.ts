/**
 * Provider implementations.
 *
 * This layer may import `@/domain` and `@/ports` and nothing else — in
 * particular not `@/infra`, so that instrumentation and caching decisions stay
 * out of the adapters. Composition happens in `@/infra/container`.
 *
 * `ErpNextApiProvider` lands here in M6 alongside these two, implementing the
 * same port. Nothing above the port changes.
 */

export { ExcelBacklogProvider, EXCEL_CAPABILITIES } from './excel/provider'
export { FixtureProvider, FIXTURE_TODAY, TENANT_A, TENANT_B, PROJECT_A1, PROJECT_A2, PROJECT_B1 } from './fixture/provider'
export { buildSnapshot, loadSnapshot, resetSnapshotCache, snapshotSourceInfo } from './excel/snapshot'
export type { BacklogSnapshot, SnapshotStats } from './excel/snapshot'
export { deriveCustomerId, hashTenantForLogs, normalizeCustomerName, IDENTITY_ASSURANCE, assertIdentitySafeForProduction } from './excel/identity'
export { COLUMNS, INTERNAL_ONLY_COLUMNS, SHEET_NAME } from './excel/columns'
export { ExcelShapeError, cellToPrimitive } from './excel/parse'
export {
  classifyItem,
  deriveAsOfDate,
  deriveLineKey,
  leastAdvanced,
  mapMaterialStatus,
  rollUpWorkOrderStatus,
  emptyDiagnostics,
} from './excel/adapter'
export type { AdapterDiagnostics } from './excel/adapter'
