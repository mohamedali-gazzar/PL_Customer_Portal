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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

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
  const [content, setContent] = useState<ReactNode>(null)

  /** Keep the tooltip on screen: flip to the other side of the cursor near an edge. */
  const place = useCallback((e: React.MouseEvent) => {
    const node = tip.current
    if (!node) return
    const r = node.getBoundingClientRect()
    let x = e.clientX + 14
    let y = e.clientY + 16
    if (x + r.width > window.innerWidth - 10) x = e.clientX - r.width - 14
    if (y + r.height > window.innerHeight - 10) y = e.clientY - r.height - 16
    node.style.left = `${x}px`
    node.style.top = `${Math.max(8, y)}px`
  }, [])

  const bind = useCallback<Bind>(
    (node) => ({
      onMouseEnter: (e) => {
        setContent(node)
        tip.current?.classList.add('on')
        place(e)
      },
      onMouseMove: place,
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
