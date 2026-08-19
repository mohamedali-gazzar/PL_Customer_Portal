/**
 * The portal is one page.
 *
 * Sign-in, the boot sequence and all five screens are states of a single client
 * application, exactly as the approved prototype behaves. The server's job here is
 * only to serve the shell; everything a customer can see arrives later, from the
 * BFF, over an authenticated request — so no tenant data is ever embedded in a
 * document that could be cached by a proxy or restored from the browser's history.
 */

import { cookies } from 'next/headers'

import { PortalApp } from '@/ui/PortalApp'
import { PREFS_COOKIE, parsePrefs } from '@/ui/lib/prefs-cookie'

export default async function Page() {
  // Appearance and language are read here rather than in the browser so that the
  // first render agrees with the one React hydrates. They are not tenant data — a
  // theme and a language — so nothing about this embeds anything a proxy may not see.
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value)

  return <PortalApp prefs={prefs} />
}
