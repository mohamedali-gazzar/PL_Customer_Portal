import { redirect } from 'next/navigation'
import { parseLocale } from '@/ui/i18n/locale'

export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  redirect(`/${parseLocale((await params).locale)}/dashboard`)
}
