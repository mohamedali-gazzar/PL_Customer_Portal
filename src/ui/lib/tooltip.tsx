'use client'

/**
 * The hover tooltip.
 *
 * One element for the whole page, as in the prototype. Its *content* is React
 * state, so tooltips are written as JSX; its *position* is written straight to the
 * DOM node on mousemove. That split matters: a project page carries several
 * hundred hoverable segments, and re-rendering the tree on every mouse event
 * would make the timeline stutter exactly when someone is trying to read it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { tipPosition } from './tip-position'

/**
 * Placement has to run before the browser paints, or the panel is visibly drawn at
 * the wrong spot and then moved. On the server there is nothing to lay out, and
 * calling useLayoutEffect there only earns a warning.
 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect


export interface TipHandlers {
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

type Bind = (content: ReactNode) => TipHandlers

const TipContext = createContext<Bind>(() => ({
  onMouseEnter: () => {},
  onMouseMove: () => {},
  onMouseLeave: () => {},
}))

export const useTip = (): Bind => useContext(TipContext)

export function TooltipLayer({ children }: { children: ReactNode }) {
  const tip = useRef<HTMLDivElement | null>(null)
  /** Where the pointer last was, so the panel can be re-placed once it has a size. */
  const at = useRef({ x: 0, y: 0 })
  const [content, setContent] = useState<ReactNode>(null)

  /**
   * Keep the panel on screen: flip to the other side of the pointer near an edge,
   * then clamp to the viewport.
   *
   * The flip alone was not enough. Flipping a 270px panel to the left of a pointer
   * 120px from the left edge puts half of it off-screen, and only the right edge
   * was ever checked — so on a phone, where every tap is near an edge, the panel
   * lost its left half. Both axes are now clamped rather than trusted to land
   * somewhere visible.
   */
  const place = useCallback((cx: number, cy: number) => {
    const node = tip.current
    if (!node) return
    const r = node.getBoundingClientRect()
    const at = tipPosition(cx, cy, r.width, r.height, window.innerWidth, window.innerHeight)
    node.style.left = `${at.left}px`
    node.style.top = `${at.top}px`
  }, [])

  /**
   * Placed again once the new content has committed.
   *
   * The handler below sets the content and places in the same breath, so it
   * measures the panel before React has rendered into it — it sizes the *previous*
   * tooltip. With a mouse the next mousemove corrects that invisibly, but a tap
   * sends no mousemove, which is why a phone left the panel wherever the wrong
   * dimensions had put it.
   */
  useIsoLayoutEffect(() => {
    if (tip.current?.classList.contains('on')) place(at.current.x, at.current.y)
  }, [content, place])

  const bind = useCallback<Bind>(
    (node) => ({
      onMouseEnter: (e) => {
        at.current = { x: e.clientX, y: e.clientY }
        setContent(node)
        tip.current?.classList.add('on')
        place(e.clientX, e.clientY)
      },
      onMouseMove: (e) => {
        at.current = { x: e.clientX, y: e.clientY }
        place(e.clientX, e.clientY)
      },
      onMouseLeave: () => {
        tip.current?.classList.remove('on')
      },
    }),
    [place],
  )

  const value = useMemo(() => bind, [bind])

  return (
    <TipContext.Provider value={value}>
      {children}
      <div id="tip" ref={tip} role="tooltip" aria-hidden>
        {content}
      </div>
    </TipContext.Provider>
  )
}

/* --------------------------------------------------------- tooltip parts -- */

export function TipHead({ swatch, children }: { swatch?: string; children: ReactNode }) {
  return (
    <div className="h">
      {swatch ? <span className="sw" style={{ background: swatch }} /> : null}
      {children}
    </div>
  )
}

/** A label/value line. `emphasis` marks the number that is the point of the tooltip. */
export function TipRow({
  label,
  value,
  emphasis,
}: {
  label?: ReactNode
  value?: ReactNode
  emphasis?: boolean
}) {
  return (
    <div className={emphasis ? 'rw v' : 'rw'}>
      {label !== undefined ? <span>{label}</span> : null}
      {value !== undefined ? <b>{value}</b> : null}
    </div>
  )
}

/** A sentence of explanation, rather than a label/value pair. */
export function TipNote({ children }: { children: ReactNode }) {
  return <div className="rw">{children}</div>
}
