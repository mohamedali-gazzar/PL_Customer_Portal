import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Powerline — Customer Project Portal',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  )
}
