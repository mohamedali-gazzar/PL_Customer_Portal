/**
 * Join class names, dropping anything absent.
 *
 * CSS Modules are typed with a string index signature, so under
 * `noUncheckedIndexedAccess` every lookup is `string | undefined`. Rather than
 * weakening that compiler flag — it has already caught real bugs in this codebase —
 * class names are composed through here, which accepts the undefined and produces a
 * clean string.
 */
export function cn(...parts: (string | undefined | false | null)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ')
}
