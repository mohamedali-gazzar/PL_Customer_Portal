/**
 * What the active data source can actually answer.
 *
 * This is the second half of the honesty mechanism (the first is `Maybe<T>`).
 * The stage engine reads it to decide whether a stage is derivable or must be
 * reported unknown, and the UI reads it to decide whether to render a screen or
 * an honest "not available in this source" panel.
 *
 * Crucially, no caller ever infers availability from an empty array or a caught
 * exception — availability is declared data. When the ERPNext provider flips
 * these flags to true, stages 4–7, Finance and Documents light up with no
 * change to the domain, the composers, the DTOs or the UI.
 */
export interface ProviderCapabilities {
  /** Stage 1 — Request For Design evidence. */
  readonly drawings: boolean
  /** Stage 2 — Work Order `material_status`. */
  readonly materialStatus: boolean
  /** Stage 3 — Work Order `status`. */
  readonly manufacturing: boolean
  /** Stage 4 — Stock Entry "Transfer To Finished Goods"; required for FAT success. */
  readonly fatEvents: boolean
  /** Stage 6 — Stock Entry + Delivery Note. */
  readonly deliveryEvents: boolean
  /** Stages 5 and 7 — Sales Invoice and Payment Entry. */
  readonly finance:
    | false
    | {
        readonly invoices: boolean
        readonly payments: boolean
        readonly schedule: boolean
        readonly aging: boolean
      }
  /** File attachments streamed through the BFF. */
  readonly documents: boolean

  /** Which stages have a planned date field in this source. */
  readonly plannedDates: {
    readonly drawings: boolean
    readonly material: boolean
    readonly manufacturingStart: boolean
    readonly manufacturingEnd: boolean
    readonly fat: boolean
    readonly delivery: boolean
  }

  /** ERPNext `Work Order.actual_start_date`. */
  readonly actualManufacturingStart: boolean

  readonly currency: boolean
  readonly contractValue: boolean
  readonly customerPoNo: boolean
  readonly cubicles: boolean
  readonly contacts: boolean

  /**
   * `open_backlog_only` means delivered and closed lines are absent from the
   * source entirely. A caller must not compute "% delivered" or "items
   * delivered" from such a source — every project would read as 0% delivered.
   */
  readonly scope: 'full_order_book' | 'open_backlog_only'

  /** False for a snapshot source: values are as of a point in time. */
  readonly liveUpdates: boolean
}

export function financeEnabled(c: ProviderCapabilities): boolean {
  return c.finance !== false
}
