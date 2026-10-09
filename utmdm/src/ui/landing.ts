import { button, themeToggle, wordmark } from './components';
import { fill, h, type Child } from './dom';
import { icon, type IconName } from './icons';

/*
 * The home page before sign-in. The pitch: campaign data is already messy by
 * the time anyone reports on it, and TagFluent is the layer after launch that
 * classifies it once, by meaning, for every report. Then who it's for, and two
 * ways in (book a demo, or sign in).
 */

const scrollTo = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function landingView(root: HTMLElement, apiUrl: string, problem?: string): void {
  const demo = demoDialog(apiUrl);
  const demoButton = (text = 'Book a demo') => button(text, { kind: 'primary', onClick: () => demo.open() });

  fill(
    root,
    h('a', { class: 'skip', href: '#main' }, 'Skip to content'),
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
      h('span', { class: 'brand' }, wordmark()),
      h('nav', { class: 'nav landing-nav', 'aria-label': 'On this page' },
        h('button', { type: 'button', class: 'nav-link', onclick: scrollTo('why') }, 'Why TagFluent'),
        h('button', { type: 'button', class: 'nav-link', onclick: scrollTo('how') }, 'How it works'),
        h('button', { type: 'button', class: 'nav-link', onclick: scrollTo('who') }, 'Who it\'s for'),
        h('button', { type: 'button', class: 'nav-link', onclick: scrollTo('control') }, 'Governance')),
      h('div', { class: 'topbar-actions' },
        themeToggle(),
        h('a', { class: 'button button-ghost', href: '#/signin' }, 'Sign in'),
        demoButton()))),
    h('main', { class: 'page landing', id: 'main' },
      problem ? h('p', { class: 'landing-problem', role: 'alert' }, icon('outstanding', 16), problem) : null,

      h('section', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('p', { class: 'eyebrow' }, 'The classification layer for live campaign data'),
          h('h1', null, 'Every campaign, classified. Every report, ', h('em', null, 'confident'), '.'),
          h('p', { class: 'hero-lead' },
            'TagFluent is one shared table that tells your whole team what every UTM means: channel, product, region, or any column you add. ',
            'Marketers write the rules in plain sentences. Analysts join on the result in your warehouse. ',
            'Every dashboard agrees, because they all read the same definitions.'),
          h('div', { class: 'hero-actions' },
            demoButton(),
            h('a', { class: 'button button-secondary', href: '#/signup' }, 'Create an account')),
          h('p', { class: 'hero-signin' }, 'Already have an account? ', h('a', { href: '#/signin' }, 'Sign in'))),
        heroVisual()),

      h('section', { class: 'promise', 'aria-label': 'What TagFluent promises' },
        h('ol', null,
          h('li', null, h('span', null, h('strong', null, 'Import'), ' the marketing data you already have.')),
          h('li', null, h('span', null, h('strong', null, 'Classify'), ' it once.')),
          h('li', null, h('span', null, h('strong', null, 'Make every report'), ' use the same definitions.')))),

      h('section', { class: 'compare', id: 'why', 'aria-labelledby': 'compare-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'Why TagFluent'),
          h('h2', { id: 'compare-title' }, 'Your tracking data is already messy. A naming convention can\'t fix what\'s already live.'),
          h('p', { class: 'section-lead' }, 'Teams, agencies, brands and regions each tag campaigns their own way. Once a campaign runs, its UTMs are history in GA4, and every report built on them inherits the mess.')),
        h('div', { class: 'compare-grid' },
          h('div', { class: 'compare-col compare-old' },
            h('h3', null, 'The old way'),
            h('ul', null,
              point('close', 'Everyone tags their own way.', 'fb, Facebook and FB_Paid land in Google Analytics as three different sources, one per team or agency.'),
              point('close', 'Analysts repair it in spreadsheets.', 'Every month, campaigns get mapped by hand in private files that drift apart.'),
              point('close', 'Dashboards disagree.', 'Two reports give two answers, and every meeting starts with "which number is right?"'),
              point('close', 'The rules live in someone\'s head.', 'When the person who knows what "SC_lal_v2" means leaves, the meaning leaves with them.'),
              point('close', 'Prevention stops at launch.', 'Builders and naming guides help the next campaign. They can\'t reach the thousands already in your reports.'),
              point('close', 'AI can\'t help.', 'Chat-with-your-data tools are only as good as the data model underneath. Messy campaign data gets you confident, wrong answers.'))),
          h('div', { class: 'compare-col compare-new' },
            h('h3', null, 'With ', wordmark()),
            h('ul', null,
              point('check', 'Works with the data you have.', 'Import live and historic UTMs straight from GA4, every spelling included. No re-tagging, no waiting for a clean slate.'),
              point('check', 'Classifies meaning, not just spelling.', 'Channel, campaign type, product, region, audience, initiative: whatever your reports group by.'),
              point('check', 'Rules you write once.', 'One plain sentence classifies every matching UTM, last year\'s and next month\'s.'),
              point('check', 'One shared source of truth.', 'Marketing, ops and analytics work from the same table instead of their own copies.'),
              point('check', 'Governed changes.', 'Every edit is versioned, attributed and reversible, so definitions can change without breaking trust.'),
              point('check', 'Analytics-ready output.', 'One row per UTM, one column per definition, ready to join in your BI tool or warehouse, and a data model AI can build on.'))))),

      h('section', { class: 'fit', id: 'fit', 'aria-labelledby': 'fit-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'Where it fits'),
          h('h2', { id: 'fit-title' }, 'UTM builders work before launch. TagFluent works after it.'),
          h('p', { class: 'section-lead' }, 'Most tools help you tag the next campaign correctly. TagFluent governs the campaigns that are already running and already in your reports, and hands clean definitions to the tools that read them.')),
        h('ol', { class: 'lifecycle' },
          stage('pencil', 'Before launch', 'Builders, templates and naming guides', 'Prevent the next mistake. Useful, and TagFluent has a builder too, but they only see campaigns that haven\'t run yet.'),
          stage('bolt', 'After launch', 'TagFluent', 'Import what\'s live, classify it by meaning, and keep classifying with reusable, versioned rules.', true),
          stage('database', 'Reporting', 'BI tools, warehouse, AI', 'Read one set of definitions, so every dashboard and every answer agrees.'))),

      h('section', { class: 'bridge', 'aria-labelledby': 'bridge-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'One table, two teams'),
          h('h2', { id: 'bridge-title' }, 'Marketing speaks campaigns. Data teams speak schemas. TagFluent speaks both.'),
          h('p', { class: 'section-lead' }, 'It bridges the gap between the people who launch campaigns and the people who report on them, so neither team has to translate for the other.')),
        h('div', { class: 'bridge-grid' },
          h('article', { class: 'bridge-card' },
            h('p', { class: 'bridge-who' }, icon('user', 16), 'For marketers'),
            h('h3', null, 'Write rules in plain sentences'),
            h('p', { class: 'rule-demo' }, 'If ', tok('content'), ' contains ', tok('citrus12'), ' then ', tok('Product'), ' is ', tok('Sparkling Citrus 12-pack')),
            h('p', null, 'One sentence classifies every matching UTM, today and when new ones arrive. No tickets, no waiting on a data team.')),
          h('div', { class: 'bridge-link', 'aria-hidden': 'true' }, icon('arrow', 22)),
          h('article', { class: 'bridge-card' },
            h('p', { class: 'bridge-who' }, icon('database', 16), 'For analysts'),
            h('h3', null, 'Get a table you can join on'),
            h('pre', { class: 'sql-demo' }, h('code', null,
              'select c.product, c.region, sum(s.sessions)\nfrom ga4_sessions s\njoin tagfluent.utm_classifications c\n  on c.utm_key = s.utm_key\ngroup by 1, 2')),
            h('p', null, 'One row per UTM, one column per classification, stamped with the version it came from.')))),

      h('section', { class: 'how', id: 'how', 'aria-labelledby': 'how-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'How it works'),
          h('h2', { id: 'how-title' }, 'Set it up once. Every new campaign arrives classified.'),
          h('p', { class: 'section-lead' }, 'Five steps from messy GA4 data to a mapping your whole stack trusts. You do the first three once; the last two keep running.')),
        h('ol', { class: 'steps' },
          step('chart', 'Connect GA4', 'Sign in with Google and pick a property. Every tagged campaign comes in, read-only, history included, with spellings like fb and Facebook merged.'),
          step('columns', 'Define your taxonomy', 'Add the columns your reports group by: Channel, Product, Region, Audience, or anything your team needs.'),
          step('pencil', 'Classify with rules or by hand', 'Write rules in plain sentences, type a value where a rule can\'t decide, and remove the rows you never want to see.'),
          step('refresh', 'New data classifies itself', 'Next month\'s campaigns arrive already classified by the rules you wrote. Only the truly new ones need a person.', 'Automatic'),
          step('database', 'Sync to your warehouse', 'The mapping lands in Snowflake, BigQuery or your warehouse, keyed and versioned, so every dashboard joins to the same values.', 'Automatic'))),

      h('section', { class: 'audience', id: 'who', 'aria-labelledby': 'who-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'Who it\'s for'),
          h('h2', { id: 'who-title' }, 'Built for teams where many hands touch the tags.'),
          h('p', { class: 'section-lead' }, 'The more brands, regions, business units and agencies tagging campaigns, the more TagFluent saves.')),
        h('div', { class: 'audience-grid' },
          h('ul', { class: 'roles' },
            role('chart', 'Marketing analytics', 'Stop re-mapping campaigns every month. Spend the time on the analysis instead.'),
            role('columns', 'Marketing operations', 'Own the taxonomy, and see every team and agency held to it, after launch as well as before.'),
            role('database', 'Data leaders', 'Get campaign definitions that are governed, versioned and joinable, not buried in spreadsheets.')),
          h('div', { class: 'fit-check' },
            h('h3', null, 'A strong fit if you'),
            h('ul', null,
              point('check', '', 'Run campaigns across several brands, regions, business units or agencies'),
              point('check', '', 'Use GA4 alongside a BI tool or data warehouse'),
              point('check', '', 'Re-map campaigns by hand for recurring reports'),
              point('check', '', 'Inherited years of campaign data nobody fully understands')),
            h('p', { class: 'fit-note' }, 'If one person tags every campaign, a good naming guide may be all you need. TagFluent earns its keep when that stops being true.')))),

      h('section', { class: 'control', id: 'control', 'aria-labelledby': 'control-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'Governance'),
          h('h2', { id: 'control-title' }, 'The people who own the data stay in control of it.'),
          h('p', { class: 'section-lead' }, 'Campaign owners decide what their campaigns mean. TagFluent makes those decisions visible, auditable and reversible.')),
        h('ul', { class: 'control-grid' },
          fact('pencil', 'Owners classify their own campaigns', 'The team that launches a campaign sets its values, instead of a downstream analyst guessing.'),
          fact('restore', 'Every change is a version', 'Who changed what, and when. Restore any earlier version, and the restore is saved as a version too.'),
          fact('lock', 'Your workspace is yours', 'Private to your account, encrypted at rest and backed up continuously.'),
          fact('check', 'Read-only to Google Analytics', 'TagFluent never changes your GA4 setup, and your Google sign-in is never stored.'))),

      h('section', { class: 'cta-band', 'aria-labelledby': 'cta-title' },
        h('h2', { id: 'cta-title' }, 'Import what you already have. Classify it once.'),
        h('p', null, 'See every report use the same definitions, starting with your own GA4 property, your naming and your questions, in a 30-minute walkthrough.'),
        h('div', { class: 'cta-actions' }, demoButton(), h('a', { class: 'button button-on-band', href: '#/signup' }, 'Create an account')))),
    h('footer', { class: 'footer landing-footer' },
      h('p', null, wordmark(), h('span', null, 'Your marketing source of truth.')),
      h('p', null, 'Sign-in by Amazon Cognito. Google Analytics access is read-only.', h('a', { class: 'footer-link', href: '/privacy.html' }, 'Privacy'))),
    demo.element,
  );
}

function point(iconName: IconName, title: string, text: string): HTMLElement {
  return h('li', null, h('span', { class: 'point-icon' }, icon(iconName, 14)), h('span', null, title ? [h('strong', null, title), ' '] : null, text));
}

function stage(iconName: IconName, when: string, who: string, text: string, ours = false): HTMLElement {
  return h('li', { class: `stage${ours ? ' stage-ours' : ''}` },
    h('p', { class: 'stage-when' }, icon(iconName, 14), when),
    h('h3', null, ours ? wordmark() : who),
    h('p', null, text));
}

function role(iconName: IconName, title: string, text: string): HTMLElement {
  return h('li', null, h('span', { class: 'fact-icon' }, icon(iconName, 18)), h('div', null, h('h3', null, title), h('p', null, text)));
}

function step(iconName: IconName, title: string, text: string, badge?: string): HTMLElement {
  return h('li', { class: `step${badge ? ' step-auto' : ''}` },
    h('span', { class: 'step-top' }, h('span', { class: 'step-icon' }, icon(iconName, 18)), badge ? h('span', { class: 'step-badge' }, badge) : null),
    h('h3', null, title), h('p', null, text));
}

function fact(iconName: IconName, title: string, text: string): HTMLElement {
  return h('li', null, h('span', { class: 'fact-icon' }, icon(iconName, 18)), h('h3', null, title), h('p', null, text));
}

const tok = (text: string) => h('span', { class: 'tok' }, text);

/*
 * The product in one picture: one campaign, already live in GA4 and tagged
 * three ways by three teams, becomes one campaign classified by meaning
 * (product, region and audience as well as channel), by rules that keep
 * classifying what arrives next. The brand and products are made up.
 */
const LIVE = [
  { utm: 'FB / Paid_Social / SUMMER%20CUP_US / citrus12_prospect', who: 'Brand team', sessions: '4,812' },
  { utm: 'fb / paid_social / summer cup - UK / lemonzero_lal-genz', who: 'Agency', sessions: '2,207' },
  { utm: 'Facebook / paid-social / SummerCup_CA_retarget / variety-box', who: 'Canada team', sessions: '1,936' },
];
const CLASSIFIED = [
  ['Sparkling Citrus 12-pack', 'United States', 'New customers'],
  ['Lemon Zero 4-pack', 'United Kingdom', 'Gen Z lookalikes'],
  ['Summer Variety Box', 'Canada', 'Past buyers'],
];

function heroVisual(): HTMLElement {
  const chip = (column: string, value: string) => h('span', { class: 'hv-chip' }, h('span', { class: 'hv-col' }, column), value);
  return h('figure', { class: 'hero-visual' },
    h('div', { class: 'hv-card hv-in' },
      h('p', { class: 'hv-label' }, icon('chart', 14), 'Live in Google Analytics', h('span', { class: 'hv-meta' }, '3 teams · 3 spellings')),
      h('ul', null, ...LIVE.map((r) => h('li', null,
        h('span', { class: 'utm' }, r.utm),
        h('span', { class: 'hv-who' }, `${r.who} · ${r.sessions} sessions`))))),
    h('div', { class: 'hv-arrow', 'aria-hidden': 'true' }, icon('down', 18), h('span', null, 'Merged and classified by 6 rules')),
    h('div', { class: 'hv-card hv-out' },
      h('p', { class: 'hv-label' }, icon('classified', 14), 'In TagFluent', h('span', { class: 'hv-meta' }, 'Version 14')),
      h('div', { class: 'hv-campaign' },
        h('p', { class: 'hv-name' }, 'Summer Cup 2026'),
        h('div', { class: 'hv-chips' }, chip('Channel', 'Paid Social'), chip('Type', 'Seasonal promo'), chip('Initiative', 'Summer refresh'))),
      h('table', { class: 'hv-table' },
        h('caption', { class: 'sr-only' }, 'What each of the three UTMs means'),
        h('thead', null, h('tr', null, ...['Product', 'Region', 'Audience'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', null, ...CLASSIFIED.map((row) => h('tr', null, ...row.map((v) => h('td', null, v)))))),
      h('p', { class: 'hv-foot' }, h('span', { class: 'hv-pulse', 'aria-hidden': 'true' }), 'New UTMs are classified as they arrive')),
    h('figcaption', { class: 'sr-only' },
      'One Facebook campaign, Summer Cup, tagged three different ways by a brand team, an agency and a regional team. ',
      'TagFluent merges the spellings into one campaign and classifies each UTM by channel, type, initiative, product, region and audience.'));
}

/** The "Book a demo" form, sent to TagFluent's demo-request endpoint. */
function demoDialog(apiUrl: string): { element: HTMLDialogElement; open(): void } {
  const field = (id: string, label: string, control: HTMLElement, hint?: Child) =>
    h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
  const name = h('input', { id: 'demo-name', name: 'name', required: true, maxlength: 100, autocomplete: 'name' });
  const email = h('input', { id: 'demo-email', name: 'email', type: 'email', required: true, maxlength: 200, autocomplete: 'email' });
  const company = h('input', { id: 'demo-company', name: 'company', required: true, maxlength: 120, autocomplete: 'organization' });
  const role = h('select', { id: 'demo-role', name: 'role' },
    ...['Marketing', 'Analytics or data', 'Marketing operations', 'Leadership', 'Agency', 'Other'].map((r) => h('option', { value: r }, r)));
  const message = h('textarea', { id: 'demo-message', name: 'message', rows: 4, maxlength: 2000, placeholder: 'For example: we run about 400 campaigns a quarter and our channel reporting never matches.' });
  // Left empty by people; bots tend to fill every field they find.
  const trap = h('input', { id: 'demo-website', name: 'website', tabindex: -1, autocomplete: 'off' });
  const status = h('p', { class: 'demo-status', role: 'status', 'aria-live': 'polite' });
  const submit = button('Request a demo', { kind: 'primary', type: 'submit' });

  const form: HTMLFormElement = h('form', {
    class: 'demo-form',
    onsubmit: (event: Event) => {
      event.preventDefault();
      void send();
    },
  },
  h('div', { class: 'demo-row' }, field('demo-name', 'Your name', name), field('demo-email', 'Work email', email)),
  h('div', { class: 'demo-row' }, field('demo-company', 'Company', company), field('demo-role', 'Your team', role)),
  field('demo-message', 'What should we focus on? (optional)', message),
  h('div', { class: 'demo-trap', 'aria-hidden': 'true' }, h('label', { for: 'demo-website' }, 'Leave this empty'), trap),
  status,
  h('div', { class: 'form-actions' }, submit));

  async function send(): Promise<void> {
    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.lastChild!.textContent = 'Sending…';
    status.textContent = '';
    status.className = 'demo-status';
    try {
      const response = await fetch(`${apiUrl}/demo-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.value, email: email.value, company: company.value, role: role.value, message: message.value, website: trap.value }),
      });
      if (!response.ok) throw new Error(String(response.status));
      fill(body, h('div', { class: 'demo-done' },
        h('span', { class: 'demo-done-icon' }, icon('check', 22)),
        h('h2', { id: 'demo-title' }, `Thanks, ${name.value.trim().split(/\s+/)[0]}.`),
        h('p', null, 'Your request is in. We\'ll email ', h('strong', null, email.value.trim()), ' to find a time that works.'),
        button('Close', { onClick: () => dialog.close() })));
    } catch {
      status.textContent = "Couldn't send that. Check your connection and try again.";
      status.className = 'demo-status is-error';
      submit.disabled = false;
      submit.lastChild!.textContent = 'Request a demo';
    }
  }

  const body = h('div', { class: 'demo-body' },
    h('p', { class: 'eyebrow' }, 'Book a demo'),
    h('h2', { id: 'demo-title' }, 'See TagFluent on your campaigns'),
    h('p', { class: 'demo-intro' }, 'Tell us a little about your team and we\'ll set up a 30-minute walkthrough.'),
    form);
  const dialog = h('dialog', { class: 'demo-dialog', 'aria-labelledby': 'demo-title' },
    h('button', { type: 'button', class: 'button button-ghost button-icon demo-close', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('close')),
    body);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return { element: dialog, open: () => dialog.showModal() };
}
