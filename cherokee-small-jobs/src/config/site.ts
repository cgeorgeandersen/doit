/**
 * Every business detail the site shows lives here: name, phone, email, hours,
 * towns, promises and reviews. Change them here, never inside pages or
 * components. The services themselves are in src/content/services.ts.
 *
 * BEFORE LAUNCH: the phone number, email and hours below are placeholders.
 * The build prints a warning while the phone number is still the placeholder.
 */

/** The made-up number the site ships with (555-01xx numbers are reserved for fiction). */
export const PLACEHOLDER_PHONE = '+17705550142';

export interface Review {
  /** The customer's own words, copied from Google or wherever they left it. */
  quote: string;
  /** How they'd like to be named, e.g. "Dana R." */
  name: string;
  town: string;
}

export interface NavItem {
  label: string;
  href: string;
}

export const SITE = {
  name: 'Cherokee Small Jobs',

  /**
   * The site's address, used for links, the sitemap and share images. Left
   * empty, builds on Vercel fall back to the project's production domain.
   * Set it once the domain is connected, e.g. 'https://www.cherokeesmalljobs.com'.
   */
  url: '' as string,

  /** Used when a page has no description of its own, and by search engines for the home page. */
  description:
    'Handyman repairs, installs and odd jobs across Cherokee County, Georgia: drywall, painting, TV mounting, minor plumbing, doors, decks and more. Free estimates.',

  /** PLACEHOLDER. `e164` is the same number as +1 and ten digits, used for tap-to-call and texting. */
  phone: { display: '(770) 555-0142', e164: PLACEHOLDER_PHONE },

  /** PLACEHOLDER. Shown on the site. Estimate requests are emailed to ESTIMATE_TO (see README). */
  email: 'hello@cherokeesmalljobs.com',

  /** PLACEHOLDER. `days` and the times feed the business listing search engines read. */
  hours: {
    display: 'Monday–Saturday, 8am–6pm',
    short: 'Mon–Sat, 8am–6pm',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '08:00',
    closes: '18:00',
  },

  county: 'Cherokee County',
  state: 'GA',
  stateName: 'Georgia',

  /** Towns named on the site, in the order they're shown. The estimate form lists them too. */
  towns: ['Canton', 'Woodstock', 'Holly Springs', 'Ball Ground', 'Waleska', 'Hickory Flat', 'Towne Lake', 'Free Home', 'Sixes'],

  /** The three promises on the ribbon under the home page headline. Keep only ones the business stands behind. */
  promises: ['Free estimates', 'Upfront prices', 'We clean up'],

  /** The kinds of multi-job visits in the "Got a list?" band. */
  lists: ['Honey-do lists', 'Move-in and move-out fixes', 'Rental turnovers', 'Home inspection repairs', 'Getting a house ready to sell'],

  /** Jobs the business refers out, shown on the Services page and in the FAQ. */
  referOut: [
    'New electrical circuits, panel work or rewiring',
    'Water heaters, gas lines or new plumbing runs',
    'Heating and air conditioning',
    'Roofing',
    'Remodels and additions that need a licensed contractor',
  ],

  /**
   * Real reviews only. The Reviews section stays hidden until at least one is
   * here, so the site never shows made-up praise.
   */
  reviews: [] as Review[],

  nav: [
    { label: 'Services', href: '/services' },
    { label: 'Service area', href: '/service-area' },
    { label: 'Free estimate', href: '/estimate' },
  ] as NavItem[],
} as const;

/** "(770) 555-0142" → "tel:+17705550142" */
export const telHref = `tel:${SITE.phone.e164}`;
export const smsHref = `sms:${SITE.phone.e164}`;
export const mailHref = `mailto:${SITE.email}`;
