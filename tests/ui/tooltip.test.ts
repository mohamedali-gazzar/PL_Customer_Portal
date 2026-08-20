/**
 * Tooltip placement.
 *
 * The reported failure was on a phone: tapping a milestone put the panel half off
 * the left edge of the screen. The cause was a flip with no clamp — the panel was
 * moved to the near side of the pointer when it would have overflowed the far edge,
 * and then trusted to have landed somewhere visible. On a 402px screen it had not.
 *
 * So these cases are all about edges, and every one asserts the same invariant:
 * the panel stays inside the viewport.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipPosition, TIP_MARGIN as M } from '@/ui/lib/tip-position'

/** A phone, and the widest the panel is allowed to get. */
const PHONE = { w: 402, h: 812 }
const TIP = { w: 270, h: 120 }

const inside = (
  at: { left: number; top: number },
  tip: { w: number; h: number },
  view: { w: number; h: number },
) =>
  at.left >= M && at.top >= M && at.left + tip.w <= view.w - M && at.top + tip.h <= view.h - M

test('the reported case: a flip that used to land off the left edge', () => {
  // Mid-screen on a phone is the case that broke. 250 + 14 + 270 overflows the
  // right, so the panel flips to the near side — and 250 - 270 - 14 is -34, which
  // the old code wrote straight to `left`. That is the missing corner in the report.
  const at = tipPosition(250, 400, TIP.w, TIP.h, PHONE.w, PHONE.h)
  assert.equal(at.left, M, 'clamped to the near edge instead of -34')
  assert.ok(inside(at, TIP, PHONE))
})

test('a tap near the left edge needs no flip and gets none', () => {
  const at = tipPosition(20, 400, TIP.w, TIP.h, PHONE.w, PHONE.h)
  assert.equal(at.left, 34, '20 + 14, since it already fits')
  assert.ok(inside(at, TIP, PHONE))
})

test('a tap near the right edge flips the panel to the near side', () => {
  const at = tipPosition(PHONE.w - 10, 400, TIP.w, TIP.h, PHONE.w, PHONE.h)
  assert.ok(at.left + TIP.w <= PHONE.w - M, 'does not run off the right')
  assert.ok(inside(at, TIP, PHONE))
})

test('a tap low on the screen puts the panel above the pointer', () => {
  const at = tipPosition(200, PHONE.h - 20, TIP.w, TIP.h, PHONE.w, PHONE.h)
  assert.ok(at.top + TIP.h <= PHONE.h - M, 'does not run off the bottom')
  assert.ok(at.top < PHONE.h - 20, 'sits above the pointer, not under it')
})

test('a tap in open space keeps the offset from the pointer', () => {
  // Nothing to avoid here, so the panel should sit just below and right of the
  // pointer — the clamp must not drag it around when it already fits.
  const at = tipPosition(60, 300, TIP.w, TIP.h, PHONE.w, PHONE.h)
  assert.equal(at.left, 74, '60 + 14')
  assert.equal(at.top, 316, '300 + 16')
})

test('every corner of a phone screen is safe', () => {
  const xs = [0, 1, M, 60, PHONE.w / 2, PHONE.w - 60, PHONE.w - 1, PHONE.w]
  const ys = [0, 1, M, 60, PHONE.h / 2, PHONE.h - 60, PHONE.h - 1, PHONE.h]
  for (const x of xs) {
    for (const y of ys) {
      const at = tipPosition(x, y, TIP.w, TIP.h, PHONE.w, PHONE.h)
      assert.ok(inside(at, TIP, PHONE), `clipped at pointer ${x},${y} -> ${at.left},${at.top}`)
    }
  }
})

test('a panel wider than the screen starts on screen rather than off it', () => {
  // No placement fits, so the guarantee narrows to: the near edge is visible.
  // Without the Math.max on the upper bound this returns a negative left.
  const wide = { w: 320, h: 120 }
  const tiny = { w: 300, h: 700 }
  const at = tipPosition(150, 300, wide.w, wide.h, tiny.w, tiny.h)
  assert.equal(at.left, M, 'pinned to the near edge, not pushed off it')
})

test('the panel is placed against its own size, not the last one', () => {
  // A short panel and a tall one at the same pointer must not land in the same
  // place near the bottom edge: the tall one has to flip further up. This is the
  // half of the fix that re-places once the new content has committed — measuring
  // before the render sized the panel that was already gone.
  const short = tipPosition(200, PHONE.h - 40, TIP.w, 60, PHONE.w, PHONE.h)
  const tall = tipPosition(200, PHONE.h - 40, TIP.w, 300, PHONE.w, PHONE.h)
  assert.ok(tall.top < short.top, 'the taller panel is lifted further')
  assert.ok(inside(short, { w: TIP.w, h: 60 }, PHONE))
  assert.ok(inside(tall, { w: TIP.w, h: 300 }, PHONE))
})
