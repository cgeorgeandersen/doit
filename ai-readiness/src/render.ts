/**
 * HTML written at build time from content.ts: the head's metadata, the header,
 * the first screen and the footer. The first screen is in the page before any
 * JavaScript runs, so it paints at once, reads without JavaScript and is what
 * search engines and link previews see. main.ts then wires up its buttons.
 *
 * Everything from content.ts passes through escapeHtml (as `e`).
 */
import { CONTENT } from './content.ts';
import type { Framework } from './lib/model.ts';
import { questionCount } from './lib/scoring.ts';
import { escapeHtml as e, tx } from './lib/text.ts';

export interface PageInfo {
  /** This site's public address, without a trailing slash. */
  siteUrl: string;
  /** For the footer's copyright line. */
  year: number;
}

const QUESTIONS = questionCount(CONTENT);

/** A link to a page on the portfolio. */
export function portfolioUrl(path = ''): string {
  return `${CONTENT.site.portfolio}${path}`;
}

/** The framework's element chip, as on the portfolio. Decorative: its name is always written beside it. */
export function chipHtml(framework: Framework): string {
  return `<span class="el el--chip" data-fw="${framework.color}" aria-hidden="true"><span class="el-symbol">${e(framework.symbol)}</span></span>`;
}

/** The headline with its emphasized word on the four-color stripe. */
function headlineHtml(title: string, emphasis: string): string {
  const at = emphasis ? title.indexOf(emphasis) : -1;
  if (at < 0) return e(tx(title));
  return `${e(tx(title.slice(0, at)))}<span class="emphasis">${e(emphasis)}</span>${e(tx(title.slice(at + emphasis.length)))}`;
}

/** "How Boring Is Your AI? A self-assessment by George Andersen" */
export function imageAlt(): string {
  const { name, author } = CONTENT.site;
  return /[?.!]$/.test(name) ? `${name} A self-assessment by ${author}` : `${name}: a self-assessment by ${author}`;
}

export function headHtml({ siteUrl }: PageInfo): string {
  const { name, author } = CONTENT.site;
  const title = e(tx(`${name} · ${author}`));
  const ogTitle = e(tx(name));
  const description = e(tx(CONTENT.meta.description));
  const url = e(`${siteUrl}/`);
  const image = e(`${siteUrl}/og.png`);
  const alt = e(tx(imageAlt()));
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tx(name),
    description: tx(CONTENT.meta.description),
    url: `${siteUrl}/`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    author: { '@type': 'Person', name: author, url: portfolioUrl('/') },
  }).replace(/</g, '\\u003c');

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="author" content="${e(author)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(author)}" />`,
    `<meta property="og:title" content="${ogTitle}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${ogTitle}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n    ');
}

export function headerHtml(): string {
  const { theme } = CONTENT.a11y;
  return `<a class="skip-link" href="#main">${e(tx(CONTENT.a11y.skip))}</a>
    <header class="site-header">
      <div class="bar wide">
        <a class="wordmark" href="${e(portfolioUrl('/'))}"><span class="dots" aria-hidden="true"><i data-fw="0"></i><i data-fw="1"></i><i data-fw="2"></i><i data-fw="3"></i></span>${e(CONTENT.site.author)}</a>
        <button type="button" class="theme-toggle" data-theme-toggle aria-label="${e(tx(theme.label, { mode: theme.auto, next: theme.light }))}">
          <span class="theme-icon" aria-hidden="true"></span>
          <span class="theme-label" data-for="auto">${e(theme.auto)}</span>
          <span class="theme-label" data-for="light">${e(theme.light)}</span>
          <span class="theme-label" data-for="dark">${e(theme.dark)}</span>
        </button>
      </div>
    </header>`;
}

export function introHtml(): string {
  const { intro, stages, frameworks } = CONTENT;
  const kicker = intro.kicker.map((item) => `<span>${e(tx(item, { questions: QUESTIONS }))}</span>`).join('');
  const modes = (['department', 'company'] as const)
    .map((mode) => {
      const { label, hint } = intro.modes[mode];
      return `<button type="button" class="mode" data-mode="${mode}">
              <span class="mode-label">${e(tx(label))}</span>
              <span class="mode-hint">${e(tx(hint))}</span>
              <span class="mode-arrow" aria-hidden="true">→</span>
            </button>`;
    })
    .join('\n            ');
  const notes = intro.notes.map((note) => `<li>${e(tx(note))}</li>`).join('');
  const last = stages.length - 1;
  const stageItems = stages
    .map((stage, i) => {
      const name = i === last ? `<span class="emphasis">${e(stage.name)}</span>` : e(stage.name);
      const goal = i === last ? `<span class="stage-goal">${e(tx(intro.goalLabel))}</span>` : '';
      return `<li class="stage${i === last ? ' stage--goal' : ''}">
              <span class="stage-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
              <span class="stage-name">${name}</span>${goal}
              <span class="stage-def">${e(tx(stage.definition))}</span>
            </li>`;
    })
    .join('\n            ');
  const frameworkItems = Object.values(frameworks)
    .map(
      (f: Framework) =>
        `<li><a class="fw-link" href="${e(portfolioUrl(f.path))}">${chipHtml(f)}<span class="fw-name">${e(tx(f.title))}</span></a></li>`,
    )
    .join('');

  return `<section id="intro" class="view intro" aria-labelledby="intro-title">
        <div class="wide">
          <p id="link-notice" class="notice" role="status" hidden></p>
          <div class="intro-head">
            <p class="kicker">${kicker}</p>
            <h1 id="intro-title" class="intro-title" tabindex="-1">${headlineHtml(intro.title, intro.emphasis)}</h1>
            <p class="dek intro-dek">${e(tx(intro.dek))}</p>
          </div>
          <div class="start">
            <h2 class="start-title">${e(tx(intro.modeHeading))}</h2>
            <div class="modes">
            ${modes}
            </div>
            <noscript><p class="noscript">${e(tx(intro.noscript))}</p></noscript>
            <ul class="intro-notes">${notes}</ul>
          </div>
          <section class="stages-block" aria-labelledby="stages-title">
            <h2 id="stages-title" class="label">${e(tx(intro.stagesHeading))}</h2>
            <p class="stages-intro">${e(tx(intro.stagesIntro))}</p>
            <ol class="stages">
            ${stageItems}
            </ol>
          </section>
          <section class="built-on" aria-labelledby="built-title">
            <h2 id="built-title" class="label">${e(tx(intro.frameworksHeading))}</h2>
            <ul class="fw-list">${frameworkItems}</ul>
            <p class="byline">${e(tx(intro.byline))} <a class="more" href="${e(portfolioUrl(intro.bylineLink.path))}">${e(tx(intro.bylineLink.text))}&nbsp;<span aria-hidden="true">→</span></a></p>
          </section>
        </div>
      </section>`;
}

export function footerHtml({ year }: PageInfo): string {
  const { footer, site } = CONTENT;
  return `<footer class="site-footer">
      <div class="wide inner">
        <p class="name">© ${year} ${e(site.author)}</p>
        <ul class="links">
          <li><a href="${e(portfolioUrl('/'))}">${e(footer.portfolioLabel)}</a></li>
          <li><a href="${e(site.linkedin)}" rel="me">LinkedIn</a></li>
        </ul>
        <p class="note">${e(tx(footer.privacy))} <a href="${e(footer.privacyLink.url)}">${e(tx(footer.privacyLink.text))}</a></p>
        <p class="note">${e(tx(footer.credit))} <a href="${e(portfolioUrl(footer.creditLink.path))}">${e(tx(footer.creditLink.text))}</a></p>
      </div>
    </footer>`;
}
