import { NextResponse, type NextRequest } from 'next/server'

/**
 * Sends the bare root to a locale.
 *
 * The root layout lives at `app/[locale]/layout.tsx` so that `lang` and `dir` can be
 * set on `<html>` itself, which means `/` has no page of its own. English is the
 * default; `Accept-Language` picks Arabic when the browser asks for it, and the header
 * switch overrides either.
 */
export function middleware(request: NextRequest): NextResponse {
  const accept = request.headers.get('accept-language') ?? ''
  const locale = /(^|,)\s*ar\b/i.test(accept) ? 'ar' : 'en'
  return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url))
}

export const config = {
  // Only the bare root. API routes, assets and every localised path are untouched.
  matcher: '/',
}
