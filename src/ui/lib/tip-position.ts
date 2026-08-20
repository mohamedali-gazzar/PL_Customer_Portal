/**
 * Where the hover panel goes.
 *
 * Split out from `tooltip.tsx` because it is the whole of the behaviour worth
 * testing and none of it needs a browser — and because Node's type stripping
 * cannot load a `.tsx` file, so a tested module has to be plain TypeScript.
 */

/** Clearance kept between the panel and every edge of the viewport. */
export const TIP_MARGIN = 8

/**
 * Where the panel goes, given the pointer, the panel's size and the viewport.
 *
 * Offset from the pointer, flipped to the near side when that would overflow the
 * far edge, then clamped. The clamp is the part that was missing: flipping a 270px
 * panel to the left of a pointer 120px from the left edge puts half of it
 * off-screen, and only the far edge was ever checked — so on a phone, where every
 * tap is near an edge, the panel lost a side.
 *
 * Pure arithmetic on purpose: it is the whole of the behaviour worth testing, and
 * it can be tested without a browser.
 */
export function tipPosition(
  cx: number,
  cy: number,
  tipW: number,
  tipH: number,
  viewW: number,
  viewH: number,
): { left: number; top: number } {
  const M = TIP_MARGIN
  let x = cx + 14
  let y = cy + 16
  if (x + tipW > viewW - M) x = cx - tipW - 14
  if (y + tipH > viewH - M) y = cy - tipH - 16
  // Math.max on the upper bound keeps the near edge winning when the panel is
  // wider or taller than the viewport itself — there is no placement that fits,
  // and starting on-screen beats starting off it.
  const fit = (v: number, size: number, limit: number) =>
    Math.min(Math.max(M, v), Math.max(M, limit - size - M))
  return { left: fit(x, tipW, viewW), top: fit(y, tipH, viewH) }
}
