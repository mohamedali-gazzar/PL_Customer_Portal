'use client'

/**
 * The boot sequence between signing in and the portal appearing.
 *
 * It is not a decorative spinner: each line names a real step the BFF performs,
 * and "Applying tenant filter (customer scope only)" is there because a customer
 * being told, once, that the scoping is server-side is worth more than a
 * paragraph in a manual nobody opens.
 *
 * It also covers the snapshot fetch, so the wait is spent showing progress rather
 * than an empty frame.
 */

import { useEffect, useRef, useState } from 'react'
import { ICO } from './lib/format'

export function Boot({ steps, onDone }: { steps: string[]; onDone: () => void }) {
  const [done, setDone] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const finished = useRef(false)

  useEffect(() => {
    let timer: number
    let index = 0

    const step = () => {
      if (index >= steps.length) {
        window.setTimeout(() => {
          setLeaving(true)
          window.setTimeout(() => {
            if (!finished.current) {
              finished.current = true
              onDone()
            }
          }, 400)
        }, 260)
        return
      }
      index += 1
      setDone(index)
      // Uneven intervals: real work does not arrive on a metronome, and a
      // progress bar that does reads as fake.
      timer = window.setTimeout(step, 230 + Math.random() * 170)
    }

    timer = window.setTimeout(step, 60)
    return () => window.clearTimeout(timer)
  }, [steps, onDone])

  const pct = steps.length === 0 ? 100 : Math.round((done / steps.length) * 100)

  return (
    <div id="boot" className={leaving ? 'on out' : 'on'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pl-logo" src="/brand/powerline-white.png" style={{ width: 170 }} alt="Powerline" />
      <div className="boot-bar">
        <div className="boot-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="boot-steps">
        {steps.map((label, i) => (
          <div key={label} className={i < done ? 'on done' : i === done ? 'on' : undefined}>
            <span className="tick">{ICO.ok}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
