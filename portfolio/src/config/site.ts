/**
 * Every piece of site-wide text lives here: name, role, the home page thesis,
 * the short bio, navigation, contact and footer notes. Change the words here,
 * never inside components or pages.
 *
 * Content (projects, frameworks, writing, and pages such as About) lives in
 * Markdown files under src/content/. See HOW-TO-ADD-CONTENT.md.
 */

export interface NavItem {
  label: string;
  href: string;
}

/** One step in the career diagram on the home page (see `bio.path`). */
export interface PathStage {
  label: string;
  made: string;
  origin?: boolean;
}

export const SITE = {
  name: 'George Andersen',

  /**
   * The site's address, e.g. 'https://georgeandersen.com'. Leave it empty until
   * you connect a domain: builds on Vercel then use the project's production
   * domain automatically, so links, the sitemap, RSS and share images stay right.
   */
  url: '',

  /** How the site describes you: header, page titles, share images. */
  role: 'Analytics & AI leader',

  /** The small line above the home page headline, shown with dots between items. */
  kicker: ['Analytics & AI leader', 'Strategy', 'Governance'],

  /** Used when a page has no description of its own (and by search engines for the home page). */
  description:
    'Analytics and AI leader George Andersen on making AI boring: methods for getting AI into production, and live projects that prove them.',

  lang: 'en',
  locale: 'en-US',

  /** The home page's opening. `emphasis` is the word that gets the dotted underline. */
  thesis: {
    headline: 'Make AI boring.',
    emphasis: 'boring',
    dek: 'Real value comes from AI that’s in production, measured, and trusted exactly as far as it’s reliable. These are the methods I use to get there, and the work that proves them.',
    linkLabel: 'Read the philosophy',
  },

  home: {
    methodsHeading: 'How I think',
    methodsIntro:
      'Make AI boring is the philosophy. Three methods put it to work at three altitudes: the portfolio, the workflow, and the single decision.',
    proofHeading: 'The proof',
    proofIntro: 'Frameworks are claims until something ships. Each project below puts at least one of them into practice.',
    writingHeading: 'Latest writing',
  },

  /** Titles and one-line descriptions of the section pages (also used on their share images). */
  sections: {
    projects: {
      title: 'The proof',
      description: 'Working tools and essays that put the frameworks into practice, each live on its own site.',
    },
    frameworks: {
      title: 'How I think',
      description: 'The methods I use to get AI into production: what to do first, where it fits in the work, and how far to trust it.',
    },
    writing: {
      title: 'Writing',
      description: 'Notes on getting AI into production, and on keeping the thinking current.',
    },
  },

  /** The short bio on the home page. The full story is src/content/pages/about.md. */
  bio: {
    text: 'Today I lead AI enablement for a large commercial organization: finding where AI fits, guiding it through governance, and reporting what it actually delivers. I got here through analytics, turning marketing and commerce data into decisions teams could act on. The habit underneath it all started with a journalism degree: make complicated things clear to people with no time to spare.',
    linkLabel: 'More about my path',
    /** Your headshot is src/assets/george-andersen.jpg: replace that file to change it everywhere. */
    portraitAlt: 'George Andersen',

    /**
     * The through-line diagram beside the bio, top to bottom. `made` finishes the
     * sentence "making complex things clear meant…". Mark where you started with
     * `origin: true`: it's drawn smaller and muted. The other stages also form the
     * line under your photo at the top of the home page.
     */
    path: [
      { label: 'Journalism degree', made: 'a story', origin: true },
      { label: 'Data & analytics', made: 'a decision' },
      { label: 'AI strategy & governance', made: 'a system people can trust' },
    ] satisfies PathStage[],
    throughLine: 'One job throughout: making complex things clear.',
  },

  /** Top navigation, in order. Add { label: 'Work with me', href: '/work-with-me' } when that page exists. */
  nav: [
    { label: 'Projects', href: '/projects' },
    { label: 'Frameworks', href: '/frameworks' },
    { label: 'Writing', href: '/writing' },
    { label: 'About', href: '/about' },
  ] satisfies NavItem[],

  contact: {
    heading: 'Let’s talk about getting AI into production.',
    linkedin: 'https://www.linkedin.com/in/cgeorgeandersen/',
    linkedinLabel: 'Message me on LinkedIn',
    /** Leave empty to keep your email off the site. */
    email: '',
    /** An optional button beside the contact links, e.g. { label: 'Work with me', href: '/work-with-me' }. */
    cta: null as NavItem | null,
  },

  footer: {
    privacy: 'No cookies. Page views are counted anonymously by Vercel Web Analytics.',
    privacyUrl: 'https://vercel.com/docs/analytics/privacy-policy',
    /** Delete this line (set it to '') to remove the credit. */
    credit: 'Built with an AI assistant, directed and edited by me.',
  },

  /** Frameworks and writing show when they were last reviewed; after this many days the stamp turns amber. */
  review: {
    staleAfterDays: 180,
  },
};
