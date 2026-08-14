'use client'

/**
 * The sign-in screen.
 *
 * Two doors, equally weighted: a customer signing in to their own orders, and
 * Powerline staff opening the console across every customer. Which one you are is
 * decided here and carried in the session — not chosen again later.
 */

import { useEffect, useRef, useState } from 'react'
import type { GatewayPayload } from '@/portal/scope'
import { arw, fd, int, short } from './lib/format'

export function Gateway({
  payload,
  error,
  busy,
  leaving,
  onSignIn,
}: {
  payload: GatewayPayload | null
  error: string | null
  busy: boolean
  leaving: boolean
  onSignIn: (role: 'customer' | 'staff', payload: { customer?: string; email?: string }) => void
}) {
  const [pane, setPane] = useState<'paneCust' | 'paneStaff'>('paneCust')
  const [customer, setCustomer] = useState('')
  const [email, setEmail] = useState('contact@customer.com')
  const [staffEmail, setStaffEmail] = useState('pm@powerline.com.eg')

  const stats = payload?.stats ?? null
  const customers = payload?.customers ?? null

  useEffect(() => {
    if (customers && customers.length > 0 && customer === '') setCustomer(customers[0]!.name)
  }, [customers, customer])

  return (
    <div id="gateway" className={leaving ? 'out' : undefined}>
      <SingleLineDiagram />
      <div className="gw-vign" />

      <div className="gw-wrap">
        <div className="gw-brand">
          <div className="gw-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pl-logo" src="/brand/powerline-white.png" alt="Powerline — باورلاين" />
          </div>
          <h1 className="gw-h1">
            Your panels,
            <br />
            <em>tracked in real time.</em>
          </h1>
          <p className="gw-sub">
            Live visibility into every panel we build for you — drawing approval, material
            readiness, manufacturing, quality, delivery and your financial position. Read directly
            from our ERP. Nothing typed by hand.
          </p>

          <div className="gw-stats">
            <Stat delay=".45s" value={stats ? int(stats.orders) : '—'} label="Active orders" />
            <Stat delay=".55s" value={stats ? int(stats.panels) : '—'} label="Panels tracked" />
            <Stat delay=".65s" value={stats ? int(stats.customers) : '—'} label="Customers" />
            <Stat delay=".75s" value={stats ? `EGP ${short(stats.backlog)}` : '—'} label="Open backlog" />
          </div>
        </div>

        <div className="gw-card">
          <div className="gw-tabs">
            <button
              className={pane === 'paneCust' ? 'gw-tab on' : 'gw-tab'}
              onClick={() => setPane('paneCust')}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.2" r="2.9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2.2 14c.6-3 3-4.6 5.8-4.6S13.2 11 13.8 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Customer
            </button>
            <button
              className={pane === 'paneStaff' ? 'gw-tab on' : 'gw-tab'}
              onClick={() => setPane('paneStaff')}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M2.4 13.2V7.1M6.1 13.2V3.4M9.9 13.2V8.8M13.6 13.2V5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Powerline staff
            </button>
          </div>

          {pane === 'paneCust' ? (
            <div id="paneCust">
              <h2>Sign in to your portal</h2>
              <p className="k">Powerline Customer Project Portal · Phase 1</p>

              <div className="fld">
                <label htmlFor="gw-email">Work email</label>
                <input
                  id="gw-email"
                  type="email"
                  value={email}
                  autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="fld">
                <label htmlFor="gw-pass">Password</label>
                <input id="gw-pass" type="password" defaultValue="••••••••••" autoComplete="off" />
              </div>

              {customers ? (
                <div className="fld">
                  <label htmlFor="gw-cust">Demo — sign in as customer</label>
                  <select id="gw-cust" value={customer} onChange={(e) => setCustomer(e.target.value)}>
                    {customers.map((c) => (
                      <option key={c.name} value={c.name}>
                        {`EGP ${short(c.backlog)} · ${c.nOrders} order${c.nOrders > 1 ? 's' : ''}  —  ${c.name}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <button
                className="gw-btn"
                disabled={busy}
                onClick={() => onSignIn('customer', { customer, email })}
              >
                {busy ? 'Signing in…' : 'Sign in to portal'}
              </button>

              {error ? <Problem>{error}</Problem> : null}

              <p className="gw-note">
                {payload ? (
                  <>
                    Demo build. Data read from ERPNext export of <b>{fd(payload.exportDate)}</b>.
                    Read-only: the portal writes nothing back to the ERP.
                  </>
                ) : (
                  'Loading…'
                )}
              </p>
            </div>
          ) : (
            <div id="paneStaff">
              <h2>Project Management Console</h2>
              <p className="k">Powerline staff · internal view across every customer</p>

              <ul className="staff-list">
                <li>
                  <span className="sd" />
                  Open backlog and contractual-date performance across all orders
                </li>
                <li>
                  <span className="sd" />
                  Phase cycle times T1–T8, medians and the 90th-percentile tail
                </li>
                <li>
                  <span className="sd" />
                  Jump straight into any customer&apos;s portal exactly as they see it
                </li>
              </ul>

              <div className="staff-stats">
                <div>
                  <b>{stats ? int(stats.orders) : '—'}</b>
                  <span>Orders</span>
                </div>
                <div>
                  <b>{stats ? int(stats.panels) : '—'}</b>
                  <span>Panels</span>
                </div>
                <div>
                  <b>{stats ? int(stats.customers) : '—'}</b>
                  <span>Customers</span>
                </div>
                <div>
                  <b>{stats ? `EGP ${short(stats.backlog)}` : '—'}</b>
                  <span>Backlog</span>
                </div>
              </div>

              <div className="fld">
                <label htmlFor="gw-semail">Powerline email</label>
                <input
                  id="gw-semail"
                  type="email"
                  value={staffEmail}
                  autoComplete="off"
                  onChange={(e) => setStaffEmail(e.target.value)}
                />
              </div>
              <div className="fld">
                <label htmlFor="gw-spass">Password</label>
                <input id="gw-spass" type="password" defaultValue="••••••••••" autoComplete="off" />
              </div>

              <button className="gw-btn" disabled={busy} onClick={() => onSignIn('staff', { email: staffEmail })}>
                {busy ? 'Signing in…' : 'Open PM console →'}
              </button>

              {error ? <Problem>{error}</Problem> : null}

              <p className="gw-note">
                Staff accounts see every customer. Customer logins are scoped to their own orders
                only — enforced server-side in the BFF, never in the browser.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, delay }: { value: string; label: string; delay: string }) {
  return (
    <div className="gw-stat" style={{ animationDelay: delay }}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="gw-note" role="alert" style={{ color: '#FF9E6D' }}>
      {children}
    </p>
  )
}

/**
 * The background: a single-line diagram that quietly energises.
 *
 * Powerline builds switchgear, so the motif is a distribution network with current
 * flowing through it. It is decoration and is treated as such — it never blocks
 * the form, it pauses for `prefers-reduced-motion`, and it stops when the screen
 * is left so no animation frame keeps running behind the portal.
 */
function SingleLineDiagram() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.getContext('2d')
    if (!cx) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let width = 0
    let height = 0
    let nodes: { x: number; y: number; r: number; tw: number }[] = []
    let links: [number, number][] = []
    let pulses: { l: number; t: number; v: number }[] = []
    let raf = 0

    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      cx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const gx = Math.max(4, Math.round(width / 135))
      const gy = Math.max(3, Math.round(height / 135))
      nodes = []
      links = []
      for (let i = 0; i <= gx; i += 1) {
        for (let j = 0; j <= gy; j += 1) {
          nodes.push({
            x: ((i + 0.5) * width) / (gx + 1) + (Math.random() - 0.5) * 26,
            y: ((j + 0.5) * height) / (gy + 1) + (Math.random() - 0.5) * 26,
            r: Math.random() < 0.16 ? 2.1 : 1.1,
            tw: Math.random() * 6.28,
          })
        }
      }
      const idx = (i: number, j: number) => i * (gy + 1) + j
      for (let i = 0; i <= gx; i += 1) {
        for (let j = 0; j <= gy; j += 1) {
          if (i < gx && Math.random() < 0.62) links.push([idx(i, j), idx(i + 1, j)])
          if (j < gy && Math.random() < 0.42) links.push([idx(i, j), idx(i, j + 1)])
        }
      }
      pulses = []
      for (let k = 0; k < Math.min(20, links.length); k += 1) {
        pulses.push({
          l: Math.floor(Math.random() * links.length),
          t: Math.random(),
          v: 0.0016 + Math.random() * 0.0028,
        })
      }
    }

    let last = 0
    const draw = (ts: number) => {
      const dt = Math.min(48, ts - last)
      last = ts
      cx.clearRect(0, 0, width, height)
      cx.lineWidth = 1

      for (const [a, b] of links) {
        const p = nodes[a]!
        const q = nodes[b]!
        cx.strokeStyle = 'rgba(255,255,255,0.045)'
        cx.beginPath()
        cx.moveTo(p.x, p.y)
        cx.lineTo(q.x, q.y)
        cx.stroke()
      }

      for (const nd of nodes) {
        nd.tw += dt * 0.0013
        const a = 0.1 + 0.1 * Math.sin(nd.tw)
        cx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
        cx.beginPath()
        cx.arc(nd.x, nd.y, nd.r, 0, 6.2832)
        cx.fill()
      }

      for (const pu of pulses) {
        pu.t += pu.v * dt
        if (pu.t > 1) {
          pu.t = 0
          pu.l = Math.floor(Math.random() * links.length)
        }
        const link = links[pu.l]
        if (!link) continue
        const p = nodes[link[0]]!
        const q = nodes[link[1]]!
        const x = p.x + (q.x - p.x) * pu.t
        const y = p.y + (q.y - p.y) * pu.t
        const tail = 0.2
        const xs = p.x + (q.x - p.x) * Math.max(0, pu.t - tail)
        const ys = p.y + (q.y - p.y) * Math.max(0, pu.t - tail)
        const g = cx.createLinearGradient(xs, ys, x, y)
        g.addColorStop(0, 'rgba(241,103,34,0)')
        g.addColorStop(1, 'rgba(240,161,129,.85)')
        cx.strokeStyle = g
        cx.lineWidth = 1.6
        cx.beginPath()
        cx.moveTo(xs, ys)
        cx.lineTo(x, y)
        cx.stroke()
        cx.fillStyle = 'rgba(255,190,150,.9)'
        cx.beginPath()
        cx.arc(x, y, 1.7, 0, 6.2832)
        cx.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    build()
    raf = requestAnimationFrame(draw)

    let resizeTimer: number
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(build, 180)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas id="gw-canvas" ref={canvasRef} aria-hidden />
}
