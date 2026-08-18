'use client'

/**
 * The portal application: sign-in → boot → the screens.
 *
 * State lives here and is passed down, so there is one place that knows who is
 * signed in and what they are looking at. The prototype kept the same shape in a
 * single mutable object; this is the same machine with the transitions made explicit.
 */

import { useCallback, useEffect, useState } from 'react'

import type { PortalSnapshot, ScopedSnapshot } from '@/portal/types'
import { scopeToCustomer, type GatewayPayload } from '@/portal/scope'
import type { StatusFilter } from './lib/status'
import { TooltipLayer } from './lib/tooltip'
import { arw, initials, int } from './lib/format'
import { Gateway } from './Gateway'
import { Boot } from './Boot'
import { Dashboard } from './views/Dashboard'
import { Projects } from './views/Projects'
import { Finance } from './views/Finance'
import { Documents } from './views/Documents'
import { Console } from './views/Console'

export type Mode = 'customer' | 'internal'
export type ViewKey = 'dash' | 'proj' | 'fin' | 'docs' | 'int'

interface NavItem {
  readonly key: ViewKey
  readonly label: string
  /**
   * Built, but not yet fed by the ERP.
   *
   * Shown rather than hidden: a customer who has been told the portal covers their
   * financial position should be able to see that it is coming, not wonder whether
   * they are missing a permission. Disabled, labelled, and not clickable.
   */
  readonly soon?: boolean
}

const NAVS: Record<Mode, readonly NavItem[]> = {
  customer: [
    { key: 'dash', label: 'Dashboard' },
    { key: 'proj', label: 'Projects' },
    { key: 'fin', label: 'Finance', soon: true },
    { key: 'docs', label: 'Documents', soon: true },
  ],
  internal: [{ key: 'int', label: 'PM Console' }],
}

type Phase = 'gateway' | 'boot' | 'app'

export function PortalApp() {
  const [phase, setPhase] = useState<Phase>('gateway')
  const [leaving, setLeaving] = useState(false)
  const [bootSteps, setBootSteps] = useState<string[]>([])

  const [mode, setMode] = useState<Mode>('customer')
  const [view, setView] = useState<ViewKey>('dash')
  const [so, setSo] = useState<string | null>(null)
  /** Project filters. Both default to everything. */
  const [year, setYear] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  const [gateway, setGateway] = useState<GatewayPayload | null>(null)
  const [gatewayError, setGatewayError] = useState<string | null>(null)

  /** The full portfolio — staff only. */
  const [portfolio, setPortfolio] = useState<PortalSnapshot | null>(null)
  /** What the current screen renders: one customer's world. */
  const [scoped, setScoped] = useState<ScopedSnapshot | null>(null)
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
      setStatus('all')
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

  const go = useCallback((k: ViewKey) => {
    setView(k)
    if (k !== 'proj') setSo(null)
    window.scrollTo({ top: 0 })
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
        <header className="top">
          <div className="top-in">
            <div className="logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pl-logo" src="/brand/powerline-white.png" alt="Powerline — باورلاين" />
              <small>{mode === 'internal' ? 'Project Management Console' : 'Customer Portal'}</small>
            </div>

            <nav className="main">
              {NAVS[mode].map((item) =>
                item.soon ? (
                  <button
                    key={item.key}
                    className="soon"
                    disabled
                    aria-disabled="true"
                    title={`${item.label} — coming soon`}
                  >
                    {item.label}
                    <span className="soon-tag">Soon</span>
                  </button>
                ) : (
                  <button
                    key={item.key}
                    className={view === item.key ? 'on' : undefined}
                    onClick={() => go(item.key)}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </nav>

            <div className="who">
              {/* Staff who stepped into a customer's portal need the way back. */}
              {portfolio && showingCustomer ? (
                <button className="out" onClick={backToConsole}>
                  ← PM console
                </button>
              ) : null}
              <span className="nm">{arw(who)}</span>
              <span className="av">{showingCustomer ? initials(who) : 'PL'}</span>
              <button className="out" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main>
          {phase === 'app' && scoped && view === 'dash' && (
            <section className="view on">
              <Dashboard
                data={scoped}
                year={year}
                status={status}
                onYearChange={setYear}
                onStatusChange={setStatus}
                onOpenProject={(id) => {
                  setSo(id)
                  setView('proj')
                }}
              />
            </section>
          )}
          {phase === 'app' && scoped && view === 'proj' && (
            <section className="view on">
              <Projects
                data={scoped}
                so={so}
                year={year}
                status={status}
                onYearChange={setYear}
                onStatusChange={setStatus}
                onOpenProject={setSo}
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
    </TooltipLayer>
  )
}
