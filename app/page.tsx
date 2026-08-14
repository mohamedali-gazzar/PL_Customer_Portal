/**
 * The portal is one page.
 *
 * Sign-in, the boot sequence and all five screens are states of a single client
 * application, exactly as the approved prototype behaves. The server's job here is
 * only to serve the shell; everything a customer can see arrives later, from the
 * BFF, over an authenticated request — so no tenant data is ever embedded in a
 * document that could be cached by a proxy or restored from the browser's history.
 */

import { PortalApp } from '@/ui/PortalApp'

export default function Page() {
  return <PortalApp />
}
