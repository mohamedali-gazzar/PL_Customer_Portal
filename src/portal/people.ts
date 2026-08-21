/**
 * The project managers, by the name the ERP export uses for them.
 *
 * The export carries a short form — "Sherif Ali", "Reham Abo-elhassan" — which is
 * enough to say who owns an order and not enough to contact them. This maps that
 * short form onto the person: their full name, their title, and how to reach them.
 *
 * The short form is the key rather than a derived match. Deriving it would be a
 * guess that breaks silently the first time someone joins with a similar name, and
 * an unmatched key here degrades to showing the short form alone, which is what the
 * portal did before this existed.
 *
 * Scope is deliberate. The directory this came from covers the whole company; only
 * Project Management is reproduced, and only the people orders are actually
 * assigned to. Nobody else's contact details belong in a customer-facing app.
 *
 * Maintained by hand, because ERPNext does not expose the HR record on the order.
 * When a PM joins or leaves, this file is the one place to change — an unknown name
 * costs a contact line, never an error.
 */

export interface Person {
  /** Full name as the HR directory records it. */
  readonly name: string
  readonly title: string
  readonly email: string
  /**
   * Egyptian mobile in local form, "01x xxxx xxxx".
   *
   * Optional: the directory has no number for every PM, and a missing one shows
   * the email alone rather than an empty row.
   */
  readonly mobile?: string
  /**
   * Who this person reports to — a name only, deliberately.
   *
   * It answers "who do I go to if this stalls", which is the question behind
   * asking for it. Contact details for the manager are not carried: escalation
   * goes through the PM, and publishing a second tier of numbers to customers
   * would invite skipping the first.
   */
  readonly manager?: string
}

/**
 * Keyed by `PortalItem.pm` / `PortalOrder.pm` exactly as ERPNext writes it.
 *
 * The email local parts match those short forms one-for-one, which is what
 * confirmed each pairing rather than the names merely looking alike.
 */
export const PROJECT_MANAGERS: Readonly<Record<string, Person>> = {
  'Tarek Helmy': {
    name: 'Tarek Helmy Othman Hussein',
    title: 'Project Management Section Head',
    email: 'tarek.helmy@powerline.com.eg',
    mobile: '010 0001 3925',
    manager: 'Moaz Magdy Tawfik Mohamed',
  },
  'Sherif Ali': {
    name: 'Sherif Ali Galal Ali',
    title: 'Projects Management Team Leader',
    email: 'sherif.ali@powerline.com.eg',
    mobile: '010 5027 6003',
    manager: 'Moaz Magdy Tawfik Mohamed',
  },
  'Mohamed Mostafa': {
    name: 'Mohamed Mostafa Gouda Omar Elsayed',
    title: 'Project Management Team Leader',
    email: 'mohamed.mostafa@powerline.com.eg',
    mobile: '010 7025 5661',
    manager: 'Moaz Magdy Tawfik Mohamed',
  },
  'Reham Abo-elhassan': {
    name: 'Reham Mohamed Abo Elhassan Saeed',
    title: 'Senior Project Management Engineer',
    email: 'reham.abo-elhassan@powerline.com.eg',
    mobile: '010 7024 4911',
    manager: 'Sherif Ali Galal Ali',
  },
  'Hesham Hashad': {
    name: 'Hesham Abd Elbasset Kamal Eldin Mansour Hashad',
    title: 'Project Management Engineer',
    email: 'hesham.hashad@powerline.com.eg',
    mobile: '010 2052 3344',
    manager: 'Mohamed Mostafa Gouda Omar Elsayed',
  },
  'Mahmoud Raafat': {
    name: 'Mahmoud Mohamed Raafat Ahmed',
    title: 'Project Coordinator',
    email: 'mahmoud.raafat@powerline.com.eg',
    // No mobile in the directory for this one.
    manager: 'Moaz Magdy Tawfik Mohamed',
  },
}

/** The person behind an order's PM name, or null when the name is not one of ours. */
export function projectManager(pm: string | null | undefined): Person | null {
  if (!pm) return null
  return PROJECT_MANAGERS[pm] ?? null
}

/**
 * The `tel:` form of a local Egyptian mobile.
 *
 * Dialled from a customer's phone the local form works; dialled from abroad, or
 * saved to a contact card, it does not. The link carries E.164 and the screen keeps
 * showing the local form people recognise.
 */
export function telHref(mobile: string): string {
  const digits = mobile.replace(/\D/g, '')
  return `tel:+20${digits.replace(/^0/, '')}`
}
