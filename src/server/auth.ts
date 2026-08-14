/**
 * Reading and asserting the caller's identity.
 *
 * Every portal route begins here. The tenant comes from the signed cookie and
 * from nowhere else — there is no code path that takes a customer name from a
 * query string, a header or a body, which is what makes brief §7.1 structurally
 * true rather than merely intended.
 */

import { cookies } from 'next/headers'
import { config } from './config'
import { readSession, SESSION_COOKIE, type Session } from './session'

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies()
  return readSession(jar.get(SESSION_COOKIE)?.value, config().sessionSecret)
}

export function unauthorized(detail = 'Sign in to continue.'): Response {
  return Response.json({ error: 'unauthorized', detail }, { status: 401 })
}

export function forbidden(detail = 'This account cannot see that.'): Response {
  return Response.json({ error: 'forbidden', detail }, { status: 403 })
}

/**
 * Turn an unexpected failure into a response that says something useful without
 * saying anything sensitive. The detail goes to the server log; the caller gets
 * the shape and a reference, never a stack or a connection string.
 */
export function serverError(context: string, cause: unknown): Response {
  const reference = Math.random().toString(36).slice(2, 10)
  console.error(`[portal] ${context} (ref ${reference})`, cause)
  return Response.json(
    { error: 'server_error', detail: `The portal could not complete that request.`, reference },
    { status: 500 },
  )
}
