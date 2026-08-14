import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { direction, LOCALES, parseLocale } from '@/ui/i18n/locale'
import { translator } from '@/ui/i18n/messages'
import '@/ui/theme/globals.css'

/**
 * The root layout lives inside the `[locale]` segment.
 *
 * That is what allows `lang` and `dir` to be set on `<html>` itself rather than on a
 * wrapper div. Arabic needs the document direction for correct scrollbar placement,
 * text selection and native form controls, and screen readers need the real `lang` to
 * choose a voice — a nested `dir` gets none of that right.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const t = translator(parseLocale((await params).locale))
  return {
    title: `${t('app.name')} ${t('app.portal')}`,
    description: t('app.portal'),
    // A customer portal has nothing to gain from being indexed.
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#17140f',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const locale = parseLocale((await params).locale)
  return (
    <html lang={locale} dir={direction(locale)}>
      <body>{children}</body>
    </html>
  )
}
