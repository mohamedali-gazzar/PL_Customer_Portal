import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import {
  PREFS_BOOT_SCRIPT,
  PREFS_COOKIE,
  directionOf,
  parsePrefs,
} from '@/ui/lib/prefs-cookie'

export const metadata: Metadata = {
  title: 'Powerline Customer Portal',
  description:
    'Live visibility into every panel Powerline builds for you — drawing approval, ' +
    'material readiness, manufacturing, quality, delivery and your financial position.',
  // A customer portal has nothing to gain from being indexed, and something to lose.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1A1A1B',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The stored preference is in a cookie, so the served document can carry the right
  // language and direction rather than correcting them after it arrives.
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value)

  return (
    // `suppressHydrationWarning` is still required and correct, for the one value
    // that remains unknowable here: a theme of "system" resolves through a media
    // query, so the boot script below settles it before the first paint and the
    // attribute React finds will legitimately differ from the one it rendered.
    <html
      lang={prefs.locale}
      dir={directionOf(prefs.locale)}
      data-theme={prefs.theme === 'system' ? 'dark' : prefs.theme}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before anything paints, so a visitor on "system" never sees the
            wrong palette flash. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
