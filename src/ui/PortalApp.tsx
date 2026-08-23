'use client'

/**
 * The portal application: sign-in → boot → the screens.
 *
 * State lives here and is passed down, so there is one place that knows who is
 * signed in and what they are looking at. The prototype kept the same shape in a
 * single mutable object; this is the same machine with the transitions made explicit.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { PortalSnapshot, ScopedSnapshot } from '@/portal/types'
import { scopeToCustomer, type GatewayPayload } from '@/portal/scope'
import { awaitingYourApproval } from '@/portal/kpis'
import { TooltipLayer } from './lib/tooltip'
import { PrefsProvider, usePrefs } from './lib/prefs'
import type { SidebarMode, StoredPrefs } from './lib/prefs-cookie'
import { I18nProvider, useT, type MessageKey } from './lib/i18n'
import { Prefs } from './components/Prefs'
import { arw, initials, int } from './lib/format'
import { Gateway } from './Gateway'
import { Boot } from './Boot'
import { Dashboard } from './views/Dashboard'
import { Item } from './views/Item'
import { Orders } from './views/Orders'
import { Pending } from './views/Pending'
import { Projects } from './views/Projects'
import { Finance } from './views/Finance'
import { Documents } from './views/Documents'
import { Console } from './views/Console'

export type Mode = 'customer' | 'internal'
export type ViewKey = 'dash' | 'open' | 'hist' | 'pending' | 'proj' | 'fin' | 'docs' | 'int'

interface NavItem {
  readonly key: ViewKey
  readonly label: MessageKey
  /**
   * Built, but not yet fed by the ERP.
   *
   * Shown rather than hidden: a customer who has been told the portal covers their
   * financial position should be able to see that it is coming, not wonder whether
   * they are missing a permission. Disabled, labelled, and not clickable.
   */
  readonly soon?: boolean
  /** Carries the count of items sitting with the customer, when there are any. */
  readonly count?: boolean
  /** Drawn in the rail, where there is no room for the label. */
  readonly icon: ReactNode
}

/* Line icons at 18px on a 20px box, 1.6 stroke — heavy enough to hold up against
   the sidebar's dark ground without reading as filled shapes. */
const ICON = {
  overview: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.8 7.5 10 2.4l7.2 5.1v9a1 1 0 0 1-1 1h-3.4v-5.2H7.2v5.2H3.8a1 1 0 0 1-1-1Z" />
    </svg>
  ),
  open: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6.2 10 2.6l7 3.6v7.6L10 17.4 3 13.8Z" />
      <path d="M3 6.2 10 9.9l7-3.7M10 9.9v7.5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.9 10a7.1 7.1 0 1 0 2.2-5.1" />
      <path d="M2.6 3.2v3.4h3.4M10 5.9V10l2.8 1.7" />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.4 2.7h7.2M6.4 17.3h7.2" />
      <path d="M6.9 2.7v3.1L10 9l3.1-3.2V2.7M6.9 17.3v-3.1L10 11l3.1 3.2v3.1" />
    </svg>
  ),
  console: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.8 3.6h14.4v12.8H2.8Z" />
      <path d="M6 8.2l2.4 2.2L6 12.6M10.8 12.8h3.2" />
    </svg>
  ),
} as const

const NAVS: Record<Mode, readonly NavItem[]> = {
  customer: [
    { key: 'dash', label: 'nav.overview', icon: ICON.overview },
    { key: 'open', label: 'nav.openOrders', icon: ICON.open },
    { key: 'hist', label: 'nav.history', icon: ICON.history },
    { key: 'pending', label: 'nav.pending', count: true, icon: ICON.pending },
  ],
  internal: [{ key: 'int', label: 'nav.console', icon: ICON.console }],
}

/** What the page header says, per destination. */
const TITLES: Partial<Record<ViewKey, MessageKey>> = {
  dash: 'nav.overview',
  open: 'page.openOrders',
  hist: 'page.history',
  pending: 'page.pending',
  proj: 'page.project',
  fin: 'nav.finance',
  docs: 'nav.documents',
  int: 'nav.console',
}

/**
 * The sidebar's three states, as a cycle.
 *
 * Pinned open → pinned closed → expand on hover → pinned open. The order is the
 * one the reader would guess: most sidebar, least sidebar, then the compromise.
 * Each entry carries the label for the state it *is*, and the state clicking moves
 * it to.
 */
/*
 * The three states, drawn as the same panel three ways.
 *
 * A pin says "fixed" but not what it is fixed *as*, so the pinned-open and
 * pinned-closed icons differed only by a tilt — two states that look alike for a
 * control whose whole job is to say which one you are in. These share one frame
 * and change what is happening inside it, which is the thing that actually
 * differs: the panel is wide, the panel is narrow, or the panel answers the
 * pointer.
 */
const PANEL = 'M2.8 3.6h14.4v12.8H2.8Z'

/** Wide rail, arrow pointing in — click to close. */
const PIN = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PANEL} />
    <path d="M8.6 3.6v12.8" />
    <path d="M14.4 10h-3.6M12.2 8.2 10.4 10l1.8 1.8" />
  </svg>
)
/** Narrow rail, arrow pointing out — click to hand it to the pointer. */
const PIN_OFF = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PANEL} />
    <path d="M6.4 3.6v12.8" />
    <path d="M10 10h3.6M11.8 8.2l1.8 1.8-1.8 1.8" />
  </svg>
)
/** Narrow rail with a pointer on it — it opens when you come to it. */
const HOVER_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PANEL} />
    <path d="M6.4 3.6v12.8" />
    <path d="M10.2 8.1 15 12.4l-2.1.3-.9 1.9Z" />
  </svg>
)

const SIDEBAR_NEXT: Record<
  SidebarMode,
  { label: MessageKey; hint: MessageKey; next: SidebarMode; icon: ReactNode }
> = {
  open: { label: 'side.open', hint: 'side.toRail', next: 'rail', icon: PIN },
  rail: { label: 'side.rail', hint: 'side.toHover', next: 'hover', icon: PIN_OFF },
  hover: { label: 'side.hover', hint: 'side.toOpen', next: 'open', icon: HOVER_ICON },
}

type Phase = 'gateway' | 'boot' | 'app'

function PortalShell() {
  const t = useT()
  const { sidebar, setSidebar } = usePrefs()
  const [phase, setPhase] = useState<Phase>('gateway')
  const [leaving, setLeaving] = useState(false)
  const [bootSteps, setBootSteps] = useState<string[]>([])

  const [mode, setMode] = useState<Mode>('customer')
  const [view, setView] = useState<ViewKey>('dash')
  /* Which list a project was opened from, so its back link returns there.
     "Projects" is no longer a destination — a reader arrives at an item from the
     overview, from open orders, from history or from their own approvals queue,
     and sending all four back to the same place loses their place. */
  const [backTo, setBackTo] = useState<ViewKey>('dash')
  /** Which item's detail is open inside a project, if any. */
  const [item, setItem] = useState<number | null>(null)
  const [so, setSo] = useState<string | null>(null)
  /** Project filters. Both default to everything. */
  const [year, setYear] = useState<string>('all')

  const [gateway, setGateway] = useState<GatewayPayload | null>(null)
  const [gatewayError, setGatewayError] = useState<string | null>(null)

  /** The full portfolio — staff only. */
  const [portfolio, setPortfolio] = useState<PortalSnapshot | null>(null)
  /** What the current screen renders: one customer's world. */
  const [scoped, setScoped] = useState<ScopedSnapshot | null>(null)
  /* The badge on the fourth destination. Counted the same way the dashboard counts
     it — from the report's stage number, never from displayed text — so the two
     figures cannot disagree. */
  /* The order and line the current position points at, resolved once. */
  const openOrderRow = scoped?.orders.find((o) => o.so === so) ?? null
  const openItemRow = item === null ? null : (scoped?.items.find((i) => i.id === item) ?? null)

  const awaitingCount = scoped
    ? awaitingYourApproval(scoped.orders, scoped.items)
    : 0
  const [signInError, setSignInError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/bootstrap')
      .then(async (r) => {
        if (!r.ok) throw new Error(`The portal could not load (${r.status}).`)
        return (await r.json()) as GatewayPayload
      })
      .then((g) => live && setGateway(g))
      .catch((e: Error) => live && setGatewayError(e.message))
    return () => {
      live = false
    }
  }, [])

  /** Fade the sign-in screen out, run the boot sequence, then reveal the app. */
  const enter = useCallback((nextMode: Mode, steps: string[]) => {
    setMode(nextMode)
    setView(nextMode === 'internal' ? 'int' : 'dash')
    setSo(null)
    setBootSteps(steps)
    setLeaving(true)
    window.setTimeout(() => setPhase('boot'), 420)
  }, [])

  const signIn = useCallback(
    async (role: 'customer' | 'staff', payload: { customer?: string; email?: string }) => {
      setBusy(true)
      setSignInError(null)
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, ...payload }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string }
          throw new Error(body.detail ?? 'Sign-in failed.')
        }

        if (role === 'staff') {
          const snap = (await (await fetch('/api/console/snapshot')).json()) as PortalSnapshot
          setPortfolio(snap)
          setScoped(null)
          enter('internal', [
            'Authenticating Powerline staff account',
            'Opening ERPNext service session',
            `Loading ${int(snap.meta.rows)} item lines across ${snap.meta.orders} orders`,
            'Computing phase cycle times',
          ])
        } else {
          const snap = (await (await fetch('/api/portal/snapshot')).json()) as ScopedSnapshot
          setScoped(snap)
          setPortfolio(null)
          enter('customer', [
            'Verifying credentials',
            'Resolving contact → customer record',
            'Applying tenant filter (customer scope only)',
            'Composing milestone timeline from ERPNext',
          ])
        }
      } catch (e) {
        setSignInError(e instanceof Error ? e.message : 'Sign-in failed.')
      } finally {
        setBusy(false)
      }
    },
    [enter],
  )

  const signOut = useCallback(() => {
    void fetch('/api/auth/session', { method: 'DELETE' }).finally(() => window.location.reload())
  }, [])

  /** Staff jumping into a customer's portal — the same scoping rule, applied locally. */
  const openCustomerPortal = useCallback(
    (name: string) => {
      if (!portfolio) return
      const s = scopeToCustomer(portfolio, name)
      if (!s) return
      setScoped(s)
      setMode('customer')
      setView('dash')
      setSo(null)
      setYear('all')
      window.scrollTo({ top: 0 })
    },
    [portfolio],
  )

  const backToConsole = useCallback(() => {
    setScoped(null)
    setMode('internal')
    setView('int')
    setSo(null)
    window.scrollTo({ top: 0 })
  }, [])

  /**
   * Move to a destination, and tell the browser about it.
   *
   * The portal is one document, so without this the Back button leaves it — which
   * is the wrong answer to "I opened a project, take me back to the list". Each
   * move pushes an entry carrying the whole position, and `popstate` restores it.
   * The URL is left alone: these are not addressable pages yet, and a path that
   * cannot be reloaded or shared is worse than no path.
   */
  const push = useCallback(
    (next: { view: ViewKey; so: string | null; from: ViewKey; item?: number | null }) => {
      window.history.pushState({ pl: next }, '')
    },
    [],
  )

  const go = useCallback(
    (k: ViewKey) => {
      setView(k)
      if (k !== 'proj') setSo(null)
      setItem(null)
      push({ view: k, so: null, from: k, item: null })
      window.scrollTo({ top: 0 })
    },
    [push],
  )

  /** Open a project, remembering the list it was opened from. */
  const openProject = useCallback(
    (id: string, from: ViewKey) => {
      setSo(id)
      setBackTo(from)
      setView('proj')
      setItem(null)
      push({ view: 'proj', so: id, from, item: null })
      window.scrollTo({ top: 0 })
    },
    [push],
  )

  /**
   * Open one item's detail.
   *
   * A history entry of its own, so Back closes the item rather than leaving the
   * project — the reader went one level in, and one level is what they get back.
   */
  const openItem = useCallback(
    (id: number) => {
      setItem(id)
      push({ view: 'proj', so, from: backTo, item: id })
      window.scrollTo({ top: 0 })
    },
    [push, so, backTo],
  )

  /**
   * Open an item from outside its project.
   *
   * The approvals queue lists lines, not orders, and its whole point is that each
   * one needs a decision — landing the reader on the project and asking them to
   * find the row again is a step backwards from where they already were. So it
   * sets the order and the line together, and remembers the queue as the way back.
   */
  const openItemIn = useCallback(
    (orderSo: string, id: number, from: ViewKey) => {
      setSo(orderSo)
      setItem(id)
      setBackTo(from)
      setView('proj')
      push({ view: 'proj', so: orderSo, from, item: id })
      window.scrollTo({ top: 0 })
    },
    [push],
  )

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (
        e.state as {
          pl?: { view: ViewKey; so: string | null; from: ViewKey; item?: number | null }
        } | null
      )?.pl
      // No state means the entry predates the app — the first render. Land on the
      // overview rather than on a blank view.
      setView(st?.view ?? 'dash')
      setSo(st?.so ?? null)
      setBackTo(st?.from ?? 'dash')
      setItem(st?.item ?? null)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const showingCustomer = mode === 'customer' && scoped !== null
  const who = showingCustomer ? scoped.customer.name : 'Powerline · Operations'

  return (
    <TooltipLayer>
      {phase === 'gateway' && (
        <Gateway
          payload={gateway}
          error={gatewayError ?? signInError}
          busy={busy}
          leaving={leaving}
          onSignIn={signIn}
        />
      )}

      {phase === 'boot' && <Boot steps={bootSteps} onDone={() => setPhase('app')} />}

      <div id="app" className={phase === 'app' ? 'on in' : undefined}>
        {/* The navigation is a column, not a strip.
            Four destinations that each answer a different question — where does the
            account stand, what is open, what shipped, what needs me — read as a list
            of places rather than a row of tabs, and the list has room for the count
            that makes the fourth one worth visiting. */}
        <aside className={`side side-${sidebar}`}>
          {/* The wordmark, cropped rather than swapped. The "P" occupies the left
              22% of the artwork, so a narrow window over the same file shows the
              monogram alone and a wide one shows the whole lockup — one asset, no
              second file to keep in sync, and the mark never shifts as it widens. */}
          <div className="side-brand">
            <span className="brand-win">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pl-logo" src="/brand/powerline-white.png" alt="Powerline — باورلاين" />
            </span>
            <small>{mode === 'internal' ? t('shell.pmConsole') : t('shell.customerPortal')}</small>
          </div>

          <nav className="side-nav">
            {NAVS[mode].map((item) =>
              item.soon ? (
                <button
                  key={item.key}
                  className="soon"
                  disabled
                  aria-disabled="true"
                  title={`${t(item.label)} — ${t('nav.soon')}`}
                >
                  <span className="nv-i">{item.icon}</span>
                  <span className="nv-l">{t(item.label)}</span>
                  <span className="soon-tag">{t('nav.soon')}</span>
                </button>
              ) : (
                <button
                  key={item.key}
                  className={view === item.key ? 'on' : undefined}
                  aria-current={view === item.key ? 'page' : undefined}
                  onClick={() => go(item.key)}
                >
                  <span className="nv-i">{item.icon}</span>
                  <span className="nv-l">{t(item.label)}</span>
                  {item.count && awaitingCount > 0 ? (
                    <span className="side-badge">{awaitingCount}</span>
                  ) : null}
                </button>
              ),
            )}
          </nav>

          {/* The account block. A monogram, the name, and the way out beneath it —
              the shape every application puts in this corner, so it needs no label
              telling the reader what it is. */}
          {/* One control, three states. Three buttons spent a third of the rail
              on options nobody changes twice; a single one shows where you are and
              moves you on, which is what a preference with an obvious order wants. */}
          <div className="side-mode">
            <button
              className={sidebar !== 'hover' ? 'on' : undefined}
              title={t(SIDEBAR_NEXT[sidebar].hint)}
              aria-label={t(SIDEBAR_NEXT[sidebar].hint)}
              onClick={() => setSidebar(SIDEBAR_NEXT[sidebar].next)}
            >
              <span className="nv-i">{SIDEBAR_NEXT[sidebar].icon}</span>
              <span className="nv-l">{t(SIDEBAR_NEXT[sidebar].label)}</span>
            </button>
          </div>

          <div className="side-foot">
            {portfolio && showingCustomer ? (
              <button className="out back" onClick={backToConsole}>
                {t('shell.backToConsole')}
              </button>
            ) : null}
            <div className="acct">
              <span className="acct-av" aria-hidden>
                {initials(who)}
              </span>
              <span className="acct-t">
                <span className="acct-nm">{arw(who)}</span>
                <button className="acct-out" onClick={signOut}>
                  {t('shell.signOut')}
                </button>
              </span>
            </div>
          </div>
        </aside>

        <div className="col">
          {/* The page header. Its title is the destination the sidebar is pointing
              at, so the two never disagree about where the reader is. */}
          {/* Identity, not location. Which destination is open is already said by
              the sidebar, in the one place a reader looks for it; repeating it here
              spent the widest line on the page saying "Overview" twice. */}
          <header className="ptop">
            <div className="hello">
              <span className="hello-av" aria-hidden>
                {initials(who)}
              </span>
              <span className="hello-t">
                <span className="hello-h">{t('dash.welcome')}</span>
                <span className="hello-nm">{arw(who)}</span>
              </span>
            </div>
            <div className="ptop-r">
              <span className="ptop-upd">
                {t('shell.updated')} <b>{scoped?.meta.exportDate ?? ''}</b>
              </span>
              <Prefs />
            </div>
          </header>

          <main>
          {phase === 'app' && scoped && view === 'dash' && (
            <section className="view on">
              <Dashboard
                data={scoped}
                year={year}
                onYearChange={setYear}
                onOpenProject={(id) => openProject(id, 'dash')}
              />
            </section>
          )}
          {phase === 'app' && scoped && (view === 'open' || view === 'hist') && (
            <section className="view on">
              <Orders
                data={scoped}
                scope={view === 'hist' ? 'delivered' : 'open'}
                onOpenProject={(id) => openProject(id, view)}
              />
            </section>
          )}
          {phase === 'app' && scoped && view === 'pending' && (
            <section className="view on">
              <Pending
                data={scoped}
                today={scoped.meta.exportDate}
                onOpenItem={(orderSo, id) => openItemIn(orderSo, id, 'pending')}
              />
            </section>
          )}
          {phase === 'app' && scoped && view === 'proj' && openItemRow && openOrderRow && (
            <section className="view on">
              <Item
                data={scoped}
                order={openOrderRow}
                item={openItemRow}
                onBack={() => window.history.back()}
              />
            </section>
          )}
          {phase === 'app' && scoped && view === 'proj' && !openItemRow && (
            <section className="view on">
              <Projects
                data={scoped}
                so={so}
                year={year}
                onYearChange={setYear}
                onOpenProject={setSo}
                onOpenItem={openItem}
                backLabel={TITLES[backTo] ?? 'nav.overview'}
                /* `history.back()`, not a state change: the crumb and the browser
                   button are the same movement, and doing it two ways would leave
                   one entry behind on every use. */
                onBack={() => window.history.back()}
              />
            </section>
          )}
          {phase === 'app' && scoped && view === 'fin' && (
            <section className="view on">
              <Finance data={scoped} />
            </section>
          )}
          {phase === 'app' && scoped && view === 'docs' && (
            <section className="view on">
              <Documents data={scoped} />
            </section>
          )}
          {phase === 'app' && portfolio && view === 'int' && (
            <section className="view on">
              <Console snapshot={portfolio} onOpenCustomer={openCustomerPortal} />
            </section>
          )}
          </main>
        </div>
      </div>
    </TooltipLayer>
  )
}

/**
 * Appearance and language wrap the whole application, because both are decisions
 * about the interface rather than about any screen inside it.
 */
export function PortalApp({ prefs }: { prefs?: StoredPrefs }) {
  return (
    <PrefsProvider initial={prefs}>
      <I18nProvider>
        <PortalShell />
      </I18nProvider>
    </PrefsProvider>
  )
}
