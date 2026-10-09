import { button, themeToggle, wordmark } from './components';
import { fill, h, type Child } from './dom';
import { icon, type IconName } from './icons';

/*
 * The home page before sign-in: what goes wrong without a shared UTM taxonomy,
 * what TagFluent changes, and two ways in (book a demo, or sign in).
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
        h('button', { type: 'button', class: 'nav-link', onclick: scrollTo('control') }, 'Data ownership')),
      h('div', { class: 'topbar-actions' },
        themeToggle(),
        h('a', { class: 'button button-ghost', href: '#/signin' }, 'Sign in'),
        demoButton()))),
    h('main', { class: 'page landing', id: 'main' },
      problem ? h('p', { class: 'landing-problem', role: 'alert' }, icon('outstanding', 16), problem) : null,

      h('section', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('p', { class: 'eyebrow' }, 'UTM governance for marketing and analytics teams'),
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

      h('section', { class: 'compare', id: 'why', 'aria-labelledby': 'compare-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'Why TagFluent'),
          h('h2', { id: 'compare-title' }, 'Campaigns move fast. Taxonomy rarely keeps up.')),
        h('div', { class: 'compare-grid' },
          h('div', { class: 'compare-col compare-old' },
            h('h3', null, 'The old way'),
            h('ul', null,
              point('close', 'No shared taxonomy.', 'Campaigns and UTMs go live with whatever someone typed that day.'),
              point('close', 'One channel, three names.', 'fb, Facebook and FB_Paid land in Google Analytics as three different sources.'),
              point('close', 'Analysts get lost.', 'Days go into mapping campaigns by hand in private spreadsheets that drift apart.'),
              point('close', 'Reporting nobody trusts.', 'Two dashboards give two answers, and every meeting starts with "which number is right?"'),
              point('close', 'AI can\'t help.', 'Chat-with-your-data tools are only as good as the data model underneath. Messy campaign data gets you confident, wrong answers.'))),
          h('div', { class: 'compare-col compare-new' },
            h('h3', null, 'With ', wordmark()),
            h('ul', null,
              point('check', 'UTMs and classification in one place.', 'Every UTM, with its Channel, Campaign, Type and any column your team needs.'),
              point('check', 'Pulled directly from Google Analytics.', 'Connect GA4 and every tagged campaign comes in, deduplicated as it arrives.'),
              point('check', 'One shared source of truth.', 'Marketers and analytics teams work in the same table, with the same access.'),
              point('check', 'Mapping sent to your database.', 'The classified table lands in your warehouse, keyed and versioned, ready to join.'),
              point('check', 'Data models AI can build on.', 'Clean, governed campaign data is what makes AI chat and BI answers worth trusting.'))))),

      h('section', { class: 'bridge', 'aria-labelledby': 'bridge-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'One table, two teams'),
          h('h2', { id: 'bridge-title' }, 'Marketing speaks campaigns. Data teams speak schemas. TagFluent speaks both.'),
          h('p', { class: 'section-lead' }, 'It bridges the gap between the people who launch campaigns and the people who report on them, so neither team has to translate for the other.')),
        h('div', { class: 'bridge-grid' },
          h('article', { class: 'bridge-card' },
            h('p', { class: 'bridge-who' }, icon('user', 16), 'For marketers'),
            h('h3', null, 'Write rules in plain sentences'),
            h('p', { class: 'rule-demo' }, 'If ', tok('campaign'), ' contains ', tok('cup'), ' then ', tok('Type'), ' is ', tok('Marketing')),
            h('p', null, 'One sentence classifies every matching UTM, today and when new ones arrive. No tickets, no waiting on a data team.')),
          h('div', { class: 'bridge-link', 'aria-hidden': 'true' }, icon('arrow', 22)),
          h('article', { class: 'bridge-card' },
            h('p', { class: 'bridge-who' }, icon('database', 16), 'For analysts'),
            h('h3', null, 'Get a table you can join on'),
            h('pre', { class: 'sql-demo' }, h('code', null,
              'select s.sessions, c.channel, c.campaign\nfrom ga4_sessions s\njoin tagfluent.utm_classifications c\n  on c.utm_key = s.utm_key')),
            h('p', null, 'One row per UTM, one column per classification, stamped with the version it came from.')))),

      h('section', { class: 'how', id: 'how', 'aria-labelledby': 'how-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'How it works'),
          h('h2', { id: 'how-title' }, 'Set it up once. Every new campaign arrives classified.'),
          h('p', { class: 'section-lead' }, 'Five steps from messy GA4 data to a mapping your whole stack trusts. You do the first three once; the last two keep running.')),
        h('ol', { class: 'steps' },
          step('chart', 'Connect GA4', 'Sign in with Google and pick a property. Every tagged campaign comes in, read-only, with spellings like fb and Facebook merged.'),
          step('columns', 'Define your taxonomy', 'Add the columns your reports group by: Channel, Campaign, Type, Region, or anything your team needs.'),
          step('pencil', 'Classify with rules or by hand', 'Write rules in plain sentences, type a value where a rule can\'t decide, and remove the rows you never want to see.'),
          step('refresh', 'New data classifies itself', 'Next month\'s campaigns arrive already classified by the rules you wrote. Only the truly new ones need a person.', 'Automatic'),
          step('database', 'Sync to your warehouse', 'The mapping lands in Snowflake, BigQuery or your warehouse, keyed and versioned, so every dashboard joins to the same values.', 'Automatic'))),

      h('section', { class: 'control', id: 'control', 'aria-labelledby': 'control-title' },
        h('div', { class: 'section-head' },
          h('p', { class: 'eyebrow' }, 'Data ownership'),
          h('h2', { id: 'control-title' }, 'The people who own the data stay in control of it.'),
          h('p', { class: 'section-lead' }, 'Campaign owners decide what their campaigns mean. TagFluent makes those decisions visible, reversible and shared.')),
        h('ul', { class: 'control-grid' },
          fact('pencil', 'Owners classify their own campaigns', 'The team that launches a campaign sets its values, instead of a downstream analyst guessing.'),
          fact('restore', 'Every change is a version', 'Who changed what, and when. Restore any earlier version, and the restore is saved as a version too.'),
          fact('lock', 'Your workspace is yours', 'Private to your account, encrypted at rest and backed up continuously.'),
          fact('check', 'Read-only to Google Analytics', 'TagFluent never changes your GA4 setup, and your Google sign-in is never stored.'))),

      h('section', { class: 'cta-band', 'aria-labelledby': 'cta-title' },
        h('h2', { id: 'cta-title' }, 'See TagFluent on your own campaigns.'),
        h('p', null, 'A 30-minute walkthrough with your GA4 property, your naming, and your questions.'),
        h('div', { class: 'cta-actions' }, demoButton(), h('a', { class: 'button button-on-band', href: '#/signup' }, 'Create an account')))),
    h('footer', { class: 'footer landing-footer' },
      h('p', null, wordmark(), h('span', null, 'Your marketing source of truth.')),
      h('p', null, 'Sign-in by Amazon Cognito. Google Analytics access is read-only.', h('a', { class: 'footer-link', href: '/privacy.html' }, 'Privacy'))),
    demo.element,
  );
}

function point(iconName: IconName, title: string, text: string): HTMLElement {
  return h('li', null, h('span', { class: 'point-icon' }, icon(iconName, 14)), h('span', null, h('strong', null, title), ' ', text));
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

/** Three spellings from GA4 become one classified row: the product in one picture. */
function heroVisual(): HTMLElement {
  const raw = ['FB / Paid_Social / SUMMER%20CUP', 'fb / paid_social / summer cup', 'Facebook / paid-social / Summer_Cup'];
  const chip = (column: string, value: string) => h('span', { class: 'hv-chip' }, icon('bolt', 12), h('span', { class: 'hv-col' }, column), value);
  return h('figure', { class: 'hero-visual', 'aria-label': 'Three spellings of one campaign from Google Analytics become one classified row' },
    h('div', { class: 'hv-card hv-in' },
      h('p', { class: 'hv-label' }, icon('chart', 14), 'From Google Analytics 4'),
      h('ul', null, ...raw.map((r) => h('li', { class: 'utm' }, r)))),
    h('div', { class: 'hv-arrow', 'aria-hidden': 'true' }, icon('down', 20)),
    h('div', { class: 'hv-card hv-out' },
      h('p', { class: 'hv-label' }, icon('classified', 14), 'In TagFluent'),
      h('p', { class: 'utm hv-utm' }, 'facebook / paid_social / summer_cup'),
      h('div', { class: 'hv-chips' }, chip('Channel', 'Paid Social'), chip('Campaign', 'Summer Cup'), chip('Type', 'Marketing')),
      h('p', { class: 'hv-foot' }, 'Spellings merged · fully classified')));
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
