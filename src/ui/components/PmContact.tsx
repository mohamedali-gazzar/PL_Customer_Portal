'use client'

/**
 * Who to talk to about this order.
 *
 * It began as the last fragment of the project's meta line — "· PM: Sherif Ali" —
 * which named the person without letting anyone reach them, and reading as one
 * more comma-separated fact rather than an answer to "who do I call?". Set on its
 * own it is still a run-on line; a person is not a field.
 *
 * So it is a block, and it borrows the two devices the app already uses for people
 * and for objects: the header's orange initials disc, which is how this interface
 * has always drawn a person, and the card surface that carries a project row and a
 * timeline item. Between the two figures above and the item table below, it answers
 * the question that sits between them — what the order is worth, who is running it,
 * what is in it.
 *
 * Degrades in two steps. A PM the directory does not know keeps their name and the
 * disc, which is what the meta line gave before. An order with no PM shows nothing:
 * a contact block with nobody in it is worse than none.
 */

import { projectManager, telHref } from '@/portal/people'
import { initials } from '../lib/format'
import { useT } from '../lib/i18n'

const Mail = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" />
    <path d="m2.4 4.6 5.6 4 5.6-4" />
  </svg>
)

const Phone = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.2 2.4H3.1c-.7 0-1.3.6-1.2 1.3.3 3 1.6 5.7 3.6 7.7s4.7 3.3 7.7 3.6c.7.1 1.3-.5 1.3-1.2v-2.1c0-.6-.4-1.1-1-1.2l-1.9-.3c-.5-.1-1 .2-1.2.6l-.4.9a9.4 9.4 0 0 1-4-4l.9-.4c.5-.2.7-.7.6-1.2l-.3-1.9c-.1-.6-.6-1-1.2-1z" />
  </svg>
)

export function PmContact({ pm }: { pm: string | null }) {
  const t = useT()
  if (!pm) return null

  const person = projectManager(pm)
  const name = person?.name ?? pm

  return (
    <section className="pmb" aria-label={t('proj.pmLabel')}>
      <span className="pmb-av" aria-hidden>
        {initials(name)}
      </span>

      <span className="pmb-id">
        <span className="pmb-lab">{t('proj.pmLabel')}</span>
        <span className="pmb-name">{name}</span>
        {person ? <span className="pmb-title">{person.title}</span> : null}
        {person?.manager ? (
          <span className="pmb-mgr">
            {t('proj.pmManager')} <b>{person.manager}</b>
          </span>
        ) : null}
      </span>

      {person ? (
        <span className="pmb-acts">
          <a className="pmb-act" href={`mailto:${person.email}`}>
            <Mail />
            <span>{person.email}</span>
          </a>
          {person.mobile ? (
            <a className="pmb-act" href={telHref(person.mobile)}>
              <Phone />
              {/* Pinned left-to-right: a phone number is a figure, not prose. */}
              <span className="num">{person.mobile}</span>
            </a>
          ) : null}
        </span>
      ) : null}
    </section>
  )
}
