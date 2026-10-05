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
   * The site's address: links, the sitemap, RSS and share images all use it.
   * Use the address visitors end up on (georgeandersen.net redirects to www).
   * Left empty, builds on Vercel fall back to the project's production domain.
   */
  url: 'https://www.georgeandersen.net',

  /** How the site describes you: under your photo, page titles, share images. */
  role: 'Analytics leader & AI champion',

  /** Used when a page has no description of its own (and by search engines for the home page). */
  description:
    'Analytics leader and AI champion George Andersen on why AI should be boring: methods for getting AI into production, and live projects that prove them.',

  lang: 'en',
  locale: 'en-US',

  /** The home page's opening. `emphasis` is the word that sits on the four-color stripe. */
  thesis: {
    /**
     * The line above the headline. A word in {braces} is shown crossed out (and
     * skipped by screen readers). Set both to '' to remove the line.
     */
    lead: 'AI today is {magic} alchemy.',
    leadAnswer: 'Let’s turn it into chemistry.',
    headline: 'AI should be boring.',
    emphasis: 'boring',
    dek: 'Real value comes from AI that’s in production, measured, and trusted exactly as far as it’s reliable. These are the methods we can use to get there, and the work that proves them.',
    linkLabel: 'Read the philosophy',
    /**
     * The button beside that link: the AI readiness assessment. `label` is its
     * first line, `note` the smaller second. Set it to null to remove the button.
     */
    cta: {
      label: 'How boring is your AI?',
      note: 'Take the free five-minute assessment',
      href: '/tools/how-boring-is-your-ai',
    } as NavItem & { note: string } | null,
  },

  home: {
    methodsHeading: 'How I think',
    methodsIntro:
      'The philosophy: AI should be boring. Four methods put it to work at four altitudes: the portfolio, the workflow, the single decision, and the person making it.',
    proofHeading: 'The proof',
    proofIntro: 'Frameworks are claims until something ships. Each project below puts at least one of them into practice.',
    writingHeading: 'Latest lab notes',
    writingLink: 'All lab notes',
  },

  /**
   * The section pages: `label` is the section's short name (page kickers, the
   * browser tab, share images), `title` its headline and `description` its intro.
   */
  sections: {
    projects: {
      label: 'Projects',
      title: 'The proof',
      description: 'Working tools and essays that put the frameworks into practice, each one written up as an experiment.',
    },
    frameworks: {
      label: 'Frameworks',
      title: 'How I think',
      description: 'The methods I use to get AI into production: what to do first, where it fits in the work, how far to trust it, and who holds the judgment.',
    },
    tools: {
      label: 'Tools',
      title: 'Tools & resources',
      description: 'Free tools that put the frameworks to work on your own team. No sign-up, and your answers stay in your browser.',
    },
    writing: {
      label: 'Lab notes',
      /** What one entry is called where it's listed under a framework's "Applied in". */
      item: 'Lab note',
      title: 'Lab notes',
      description: 'Working notes on getting AI into production, numbered and dated like a lab notebook.',
      /** Shown under the intro on the Lab notes page; *words* in asterisks are italic. Set it to '' to remove it. */
      note: 'Writing is one of the things I think should stay human. Communication is an extension of thinking, and it’s easy to let things slip. For this reason, I’m keeping my lab notes *mostly me* and relying on AI only for basic editing and polish. I don’t want to read AI-written blogs, and you don’t either. So I’ll keep that promise or tell you when I don’t.',
    },
  },

  /** The short bio on the home page. The full story is src/content/pages/about.md. */
  bio: {
    text: 'Today I help lead AI enablement for a large commercial organization: finding where AI fits, guiding it through governance, and reporting what it actually delivers. I got here through analytics, turning marketing and commerce data into decisions teams could act on. The habit underneath it all started with a journalism degree: make complicated things clear to people with no time to spare.',
    linkLabel: 'More about my path',
    /** Your headshot is src/assets/george-andersen.jpg: replace that file to change it everywhere. */
    portraitAlt: 'George Andersen',

    /**
     * The through-line diagram beside the bio, top to bottom. `made` finishes the
     * sentence "making complex things clear meant…". Mark where you started with
     * `origin: true`: it's drawn smaller and muted.
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
    { label: 'Tools', href: '/tools' },
    { label: 'Lab notes', href: '/writing' },
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
    /** How the site was made. Delete this line (set it to '') to remove it. */
    credit: 'The ideas, frameworks and design here are mine. I use AI the way this site recommends: it does some of the hauling, I keep the judgment.',
    /** The link after the credit: the framework it describes. */
    creditLink: { text: 'Keep It Human', href: '/frameworks/keep-it-human' },
  },

  /** Frameworks and writing show when they were last reviewed; after this many days the stamp turns amber. */
  review: {
    staleAfterDays: 180,
  },
};
