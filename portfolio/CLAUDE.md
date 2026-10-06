# George Andersen's portfolio: guide for maintainers

A static Astro site: George's frameworks for making AI useful ("theory"), a two-page playbook that puts them together as the ideal state of a company (the centerpiece), and the live projects that prove them ("proof"), several of them free tools, among them an AI readiness self-assessment ("How Boring Is Your AI?"). The audience is hiring managers and executives first, consulting clients later. The philosophy the site argues for is **"AI should be boring"**: production over pilots, measured results over demos, fit before tools, trust calibrated to reliability. Always phrase it that way, never as "Make AI boring": that construction echoes a political slogan, and it was renamed for that reason (the old `/frameworks/make-ai-boring` address redirects, see `vercel.json`). The site should practice it too: plain, current, honest about its gaps.

The owner is not a full-time developer. **Adding a project, framework, post or page must stay one Markdown file (plus an optional image)**, with no edits to components, layouts or routing. Protect that above everything else. `HOW-TO-ADD-CONTENT.md` is the owner's guide; keep it in sync with any change to the content model.

## Commands (run in `portfolio/`, Node 22)

```bash
npm ci                   # install
npm run dev              # http://localhost:4321, drafts visible
npm run build            # astro check (types) + static build to dist/; must pass with 0 errors
npm run preview          # serve dist/
npm test                 # the assessment's and the playbook's tests (Node's own test runner): scoring, share links, content, email
npm run check:reviews    # frameworks/posts past the 180-day review window (--strict exits 1)
npm run drafts           # the assessment's and the playbook's words still marked TODO REVIEW
npm run playbook:pdf     # build, then print /playbook to public/playbook.pdf (Chromium for Playwright once: npx playwright-core install chromium)
```

## Layout

```
portfolio/
  astro.config.ts          site URL resolution, sitemap, Markdown comment stripping
  src/config/site.ts       ALL site-wide text (name, role, thesis, section titles, bio, nav, contact, footer, review window)
  src/content.config.ts    Zod schemas for projects, frameworks, writing, pages
  src/content/             the Markdown content (one file per item; project covers sit next to their .md)
  src/lib/content.ts       getSite(): loads, filters drafts, sorts, derives links, numbers and symbols, checks links
  src/lib/dates.ts         UTC-safe formatting and the review-window test
  src/lib/status.ts        project statuses (shared by schema, pill, filter)
  src/lib/typeset.ts       curly quotes for frontmatter text
  src/lib/og.ts            share-image renderer (satori + sharp)
  src/og-fonts/            static font cuts for share images (build-time only) + OFL licences
  src/assessment/          the AI readiness assessment: content.ts (ALL its words), scoring, share links,
                           the question and results screens, email adapter (stub), assessment.css
  src/playbook/            the playbook: content.ts (ALL its words), model.ts, playbook.css, pdf.ts (is the
                           PDF current?), pdf.json (the fingerprint the PDF was printed from)
  src/styles/              tokens.css (palette, type, spacing) and global.css (base, prose, layout)
  src/layouts/BaseLayout.astro   head, fonts, theme pre-paint, header, footer, analytics
  src/components/          SiteHeader, SiteFooter, ThemeToggle, ReviewStamp, StatusPill, ProjectCard,
                           FrameworkCard, ElementTile, FailureModes, LinkPreview, ProjectFilter, PostList,
                           ContactBand, ThroughLine, Seo, Assessment
  src/pages/               index, 404, [page] (About etc.), playbook, projects/, frameworks/, writing/,
                           tools/how-boring-is-your-ai/ (the assessment and its results page), rss.xml.ts,
                           robots.txt.ts, og/[...route].png.ts
  public/playbook.pdf      the playbook, printed (made by npm run playbook:pdf, never by hand)
  scripts/                 check-reviews.mjs, list-drafts.mjs, make-playbook-pdf.mjs, make-og-fonts.py (one-time)
  tests/                   the assessment's and the playbook's tests (*.test.mjs, run by npm test)
```

## Content model

Four collections (`src/content.config.ts`), each a folder of `.md` files; the file name is the id and the URL slug.

| Collection | Required fields | Optional fields |
| --- | --- | --- |
| `projects` | `title`, `summary` (≤160), `status` (`live` / `in progress` / `archived`), `date` | `tags`, `cover` + `coverAlt`, `liveUrl` (required if live), `kind` ("Self-assessment") and `time` ("5 minutes", both shown above the title on cards), `action` (the button's words, default "Open the project"), `frameworks` (references), `note` (an aside under the summary on the project page), `featured`, `order` (default 100), `draft` |
| `frameworks` | `title`, `thesis` (≤200), `date`, `lastReviewed`, `failureModes` (≥1 × `name` / `risk` / `precaution`) | `relatedProjects`, `kind` (`method` / `philosophy`), `question`, `order`, `symbol` (`Ct`), `reaction` (`inputs` ≥2, `output`), `draft` |
| `writing` (shown as "Lab notes") | `title`, `date` | `summary` (subtitle and list text; without it, `openingOf()` gives search and link previews the note's opening sentences), `frameworks` (references), `tags`, `lastReviewed`, `draft` |
| `pages` | `title`, `description` | `image` + `imageAlt` (a photo beside the title), `draft` |

Rules that matter:

- **The project ↔ framework link is stored once, on the project** (`frameworks: [...]`), and the same goes for lab notes. A framework's "Applied in" list is derived in `getSite().projectsFor()` and `notesFor()`; notes are listed after projects and marked "Lab note" (`SITE.sections.writing.item`). A note's frameworks show as symbol chips in its header. Never add a second, hand-maintained list; `relatedProjects` exists only for projects that are related without formally applying the framework, shown separately as "Related".
- **Numbering:** frameworks with `kind: method` are numbered 1, 2… by `order`; the one with `kind: philosophy` (AI Should Be Boring, symbol **Bo**, set in its frontmatter because the derived **Sb** is antimony) is element 0, frames the others and is linked from the home hero. `getSite().elementOf()` gives a framework's number, kind and symbol; `symbolOf()` makes the symbol from the title (first letters of the first two words, skipping "AI" and small words) unless the file sets `symbol`. `checkSymbols()` fails the build if two frameworks would share one.
- **Lab notes** are the `writing` collection under another name: the URL stays `/writing`, the words come from `SITE.sections.writing` and `nav`. `getSite().entryOf()` numbers them 001, 002… from the oldest, so backdating a post renumbers the ones after it.
- **Always read content through `getSite()`**, not `getCollection()` directly: it drops drafts in builds, sorts, and runs the link checks.
- **Link checks:** Astro 7 only logs a misspelled `reference()` and exits 0. `checkLinks()` in `src/lib/content.ts` throws instead (for projects, frameworks, lab notes and tools), naming the file and suggesting the closest id. Keep it.
- **Projects are the tools.** There was a separate Tools & resources section, but every tool had a project and every project was a tool, so they're one section (`/tools` redirects to `/projects`). A project's button is `openLink()` in `src/lib/content.ts`: its `action` words, the same tab when `liveUrl` is on this site (the assessment), a new tab, saying so, when it's another site. `LinkPreview` follows the same rule.
- **Error messages are part of the UX.** Every schema field uses `explain()` so a missing field reads "summary: Required: one line describing the project, under 160 characters". Keep new fields to the same standard.
- **Drafts** (`draft: true`) render in `npm run dev` with a "Draft · not published" label and are excluded from builds, feeds, sitemap and share images.
- **Standalone pages:** any file in `src/content/pages/` becomes `/<id>` via `src/pages/[page].astro`. Slugs that would shadow a section (`projects`, `frameworks`, `writing`, `og`, …) fail the build.

### Adding each type (the owner's templates are in HOW-TO-ADD-CONTENT.md)

- **Project:** `src/content/projects/<slug>.md` (+ optional `<slug>.png` cover next to it). Link frameworks by file name. The body is an experiment write-up with four `##` sections, numbered by CSS on the project page: Hypothesis (its first paragraph is the claim, set as a lede) / Method / Result / What I'd change.
- **Framework:** `src/content/frameworks/<slug>.md` with two body sections, The idea / Why it works, and its failure modes in frontmatter (rendered by `FailureModes.astro` after the body). An opening paragraph before the first heading is set as a lede (AI Should Be Boring uses this for the alchemy history). If the number of methods changes, update `home.methodsIntro` in `site.ts` (it says "Four methods").
- **Lab note:** `src/content/writing/<slug>.md`. George writes these himself: publish them as written, formatting only. Don't add a summary, tags, framework links or other words he didn't ask for. The Lab notes page promises the notes are "mostly me", with AI only for basic editing and polish (`sections.writing.note` in `site.ts`): never draft a lab note for him.
- **Page:** `src/content/pages/<slug>.md`, then a `nav` entry in `site.ts` (and optionally `contact.cta`). The nav is full at five labels on phones; see Header below.
- **A new content type** (rare): add a collection with `explain()` messages, load it in `getSite()`, add index/detail pages, add share-image cards in `src/pages/og/[...route].png.ts`, add it to RSS if it's dated, and document it in both guides.

## The AI readiness assessment ("How Boring Is Your AI?")

A free self-assessment at `/tools/how-boring-is-your-ai`, linked from the home hero (`thesis.cta` in `site.ts`), the playbook and its project card. It's a project: its kicker links to Projects, and the nav marks Projects as current anywhere under `/tools/` (the `also` paths on a nav item). Eighteen questions in six dimensions, each built on a framework; four answer options per question describing what someone could see happening, scored 0 to 3; stages Magic → Alchemy → Chemistry → Boring from the average answer, held to one step above the weakest dimension; the three biggest gaps with one next step each, linked to their play in the playbook and to their framework.

- **Its words are the exception to "content lives in Markdown":** structured content (questions with scored options) lives in `src/assessment/content.ts`, one file, written for the owner to edit, with a comment at the top explaining the rules. Drafts are marked `// TODO REVIEW`; `npm run drafts` lists them. Never hard-code its words elsewhere.
- **Framework facts are never copied:** a dimension names its framework by file name; `Assessment.astro` resolves titles, symbols, colors and pages from `getSite()` (stopping the build on a misspelling), hands them to the browser in `data-frameworks`, and renders one `ElementTile` chip per framework in a `<template>` for the browser to copy, so chips are the real component.
- **Progressive enhancement:** the first screen is written at build time and reads fully without JavaScript (with a `<noscript>` note); questions and results are drawn in the browser (`src/assessment/app.ts`, framework-free). Every step is a history entry, so a phone's back gesture steps back one question; answers in progress are in `sessionStorage`.
- **Results live after the #:** `/tools/how-boring-is-your-ai/results#v=1&m=d&a=…&t=…` (`share.ts`). That page is `noindex`, left out of the sitemap, and counted as its own page view, so analytics shows starts and finishes. Nothing after `#` is ever sent to analytics (`webAnalyticsBeforeSend` in `BaseLayout.astro`). Bump `shareVersion` in `content.ts` when questions or options are added, removed or reordered.
- **Email** goes through an adapter (`src/assessment/email.ts`). The default stub sends nothing and keeps the form off the published site; HOW-TO-ADD-CONTENT.md says how to connect a service.
- **Tests** (`tests/*.test.mjs`, `npm test`, also in CI) cover the scoring rules, share links, the email adapters, and the content's structure and tone (no emoji, no hype words, no agree/disagree scales, no comparisons with other organizations).

## The playbook ("What boring AI looks like")

The site's centerpiece, at `/playbook`: first in the nav, a band under the home hero (`index.astro`), and the target of every assessment gap. A two-page guide **written to be the first thing someone sees**: it explains "boring" (four points), gives a first-90-days plan with an owner per step and a "who's who", then six plays, the responsible-AI rules, the AI champion network, the assessment, and who made it. Keep it self-contained: no site terms a newcomer wouldn't know (centaurs, alchemy, stage names, framework symbols); a test rejects the obvious ones.

- **Its words are all in `src/playbook/content.ts`** (shapes in `model.ts`), like the assessment's, with `// TODO REVIEW` drafts. Framework names (credited in the footer) and colors (each play's band) come from the collection; never type them into the playbook. A misspelled framework or dimension stops the build with a message.
- **It's in step with the assessment:** play N answers dimension N (same ids, same order, framework taken from the dimension), and its "You'll know it's working when" list is the top answer to each of that dimension's questions, keyed by question id. A play's anchor is `/playbook#<dimension id>`. `tests/playbook-content.test.mjs` checks all of that, and that it still reads in the time its kicker promises ("5-minute read", at 238 words a minute, counting what the page shows).
- **A document, on screen and on paper.** On screen it's a sheet on a `--paper-2` band (no frame below 640px): one column of plays on phones, two from 720px, three from 1100px. In print it's two pages that fit both Letter and A4 (A4's width, Letter's height): a 10.3px root (about 7.4pt body), page one ending after plays 1–3, plays 4–6 starting page two (`.play:nth-child(4)`), framework colors kept with `print-color-adjust: exact`. Every page prints in the light palette, whatever the theme (`global.css`).
- **The PDF** (`public/playbook.pdf`, "Download the PDF") is the page printed by `npm run playbook:pdf` (`scripts/make-playbook-pdf.mjs`: builds, serves `dist/` on a spare port, prints Letter with `playwright-core`, refuses anything but two pages, saves the page's fingerprint in `src/playbook/pdf.json`). `src/playbook/pdf.ts` fingerprints the words, every framework's name, symbol and color, and the page's markup and styles (`src/pages/playbook.astro`, `src/playbook/playbook.css`). When that doesn't match the stamp, `/playbook` and the home band offer "Print or save as PDF" instead of the download, and the build log says why. **After any change to the playbook's words, markup or styles, run `npm run playbook:pdf` and commit the PDF and the stamp with it.**
- Share image: `/og/playbook.png`.

## Design system: "Studio"

Clean and modern with a controlled burst of color: a white page, near-black type, and five framework colors that do real work (they tell you which framework you're looking at). Business-first, not a template: no stock gradients, no illustrations, no shadows everywhere.

**Palette** (`src/styles/tokens.css`; dark values redefined twice, for the OS setting and for `data-theme="dark"`, so the toggle wins both ways):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` / `--paper-2` / `--paper-3` | `#ffffff` / `#f4f5f7` / `#e9ebef` | `#0e1014` / `#171a20` / `#20242b` | page / cards / wells |
| `--ink` / `--ink-2` / `--ink-3` | `#111318` / `#3e4450` / `#5c6370` | `#eef0f4` / `#b9bfca` / `#8e95a3` | text / secondary / metadata |
| `--rule` / `--rule-strong` | `#e2e5ea` / `#c9ced6` | `#262a33` / `#3a404b` | hairlines, card borders |
| `--fw-0` (violet) | `#6b45f0` | `#9d80ff` | the philosophy (AI Should Be Boring) |
| `--fw-1` (cobalt) | `#2759f5` | `#6e8fff` | method 1, 5, 9…; also `--accent` (links, focus ring) |
| `--fw-2` (coral) | `#f2553a` | `#ff7a62` | method 2, 6…; also the hazard label on Failure modes |
| `--fw-3` (teal) | `#0fa08e` | `#2ccdb8` | method 3, 7… |
| `--fw-4` (gold) | `#e0a400` | `#f0c23a` | method 4, 8…; more yellow than the reserved amber, and never used for warnings |
| `--fw-N-ink` | darker / lighter twins | | the same colors when used as **text** (AA on paper) |
| `--fresh` | `#0a7568` | `#2ccdb8` | the review stamp's "current" dot |
| `--stale` / `--stale-ink` | `#ad721c` / `#7b510d` | `#c3862e` / `#deae62` | **amber, reserved for "may be out of date"** |

- **Framework colors are assigned, not chosen.** `getSite().colorOf(framework)` returns the slot: 0 for the philosophy, then methods cycle 1 → 2 → 3 → 4 by their order. Put `data-fw={colorOf(f)}` on an element and use `var(--fw)` (marks) / `var(--fw-ink)` (text) inside it. A new framework gets its color automatically; never hard-code one.
- **The four-color stripe** (violet / cobalt / coral / teal, equal quarters) is the signature: under "boring." in the hero, under the headshot, on share images. The **four-dot mark** (two by two) is the logo in the header, favicon and share-image kicker. Both stay four colors (violet, cobalt, coral, teal) as the brand mark; gold, added with the fourth method, appears only on that framework's own tiles, cards and chips.
- **Amber stays reserved.** It appears only on overdue review stamps (and draft labels in dev); using it elsewhere drains the warning of meaning. That's why coral, not orange, is a framework color.
- **Color never carries meaning alone:** framework colors always sit beside the framework's symbol, number or name; stamps pair the dot with words; status pills use ● / ◐ / ○ plus a label; pressed filter chips are filled and carry a ✓. The one reuse is coral for hazards: the Failure modes label is always the diamond, the "!" and the words, so it can't be read as framework 2.
- **Colored text and fills use the `-ink` twins.** The symbol chips are white-on-`--fw-N-ink` (the bright `--fw-N` fails AA behind small white text).
- All text tokens pass WCAG AA on both surfaces in both themes. Re-check contrast if you change a token (use the `-ink` variant for colored text).

**Type:** Bricolage Grotesque (variable, with an optical-size axis) for headlines at weight 700–800 with tight tracking (about -0.035em; the hero is 800 / -0.045em). Instrument Sans for everything else: body (17px phones / 18px desktop), labels, kickers, dates, stamps and buttons (`--font-label` points to it; labels are uppercase with tracking). Both are self-hosted from Fontsource, imported in `BaseLayout.astro`, and their latin files are preloaded.

**The headshot** is `src/assets/george-andersen.jpg`, shown in grayscale on the four-color stripe in the home hero (a card beside the headline from 720px, a compact byline above it on phones, so it's always above the fold) and on the About page (via the page's `image` field). It appears once per page. The color comes from the stripe, not the photo, so any photo fits. The current file is 400px; a larger square original would render sharper on high-density screens.

**Signature details:** the four-color stripe; the through-line diagram beside the home bio (`ThroughLine.astro`, words from `bio.path` in `site.ts`: the `origin` stage is drawn muted, the last stage carries the accent); framework cards with a colored top band and a small element tile; the review stamp (`ReviewStamp.astro`), teal dot → amber after `review.staleAfterDays` (180), computed at build *and* re-checked in the browser so it stays honest without rebuilds; kickers separated by dots (the `.kicker` clip trick prevents a stray leading dot on wrapped lines).

**The lab theme ("from alchemy to chemistry").** The site's metaphor: AI today is alchemy (impressive once, hard to repeat, occasionally explosive), and dependable, boring AI is the move to chemistry (method, measurement, records). It lives in the words and the structure, never in pictures:

- the line above the home headline (`thesis.lead` / `leadAnswer` in `site.ts`; a `{word}` in braces is struck through and hidden from screen readers) and the history that opens the AI Should Be Boring page;
- frameworks as elements (`ElementTile.astro`: `chip` beside names, `sm` on cards, `lg` in the table on /frameworks, on each framework page and on its share image), with an optional `reaction` formula under the thesis;
- projects written up as experiments, frameworks ending in a Failure modes safety sheet, and posts as numbered lab notes.

Keep it that way: no beakers, flasks, smoke, explosions or other clip art; no parchment, gilding or "magic" styling (gold as a framework color is fine) (except the struck-out word); and don't rename the plain sections (Projects, Frameworks, About). One well-placed metaphor is intriguing; a costume isn't. Every lab element must also make the content clearer: a testable hypothesis, a precaution per risk, a dated entry.

**Header:** five nav labels (Playbook, Frameworks, Projects, Lab notes, About). On phones they sit in their own row under the wordmark, with tighter spacing and type that shrinks with the screen below about 400px (`clamp(0.7rem, 3.7vw, 0.86rem)`), so they fit one row down to 320px, every link at least 44px wide; the one-row desktop header starts at 800px. A sixth label, or a longer one, needs re-measuring (or a menu).

**Layout:** `.wide` (70rem) for page structure, `.measure` (38rem) for reading; detail pages use `.detail` (text column + a margin column on ≥1100px; margin column first on phones). 16px minimum gutters; nothing may scroll sideways at 320px. Corners: `--radius` 12px, cards 16px, buttons 10px.

**Motion:** one entrance on the home hero, hover transitions, all disabled under `prefers-reduced-motion`. The hero headline only moves, never starts invisible (it's the LCP element).

**Never:** stock gradients (the stripe is hard-edged, not a gradient blend), hero illustrations, laboratory clip art, emoji, a decorative color beyond the five framework slots, drop shadows everywhere.

## Conventions

- Site-wide words live in `site.ts`; content words live in Markdown. Don't hard-code either in components (including George's name: use `SITE.name`).
- Dates in frontmatter are calendar days parsed as UTC midnight. Format them with `src/lib/dates.ts` (UTC), never `toLocaleDateString()` without `timeZone: 'UTC'`, or they show a day early in the Americas.
- Text fields in frontmatter pass through `typeset()` (curly quotes); Markdown bodies get smart punctuation from the processor.
- Scripts are small, framework-free, and progressive enhancement: the page must work and read fully without JavaScript (the theme toggle and filters hide themselves when JS is off; the assessment's first screen reads without it and says it needs JavaScript to add up answers).
- Keep dependencies minimal. There is no CMS, database, backend or UI framework, and there shouldn't be. `playwright-core` is a dev dependency only for `npm run playbook:pdf`; nothing from it ships.
- Accessibility bar: semantic landmarks and one `h1` per page; visible `:focus-visible` ring; 24px+ targets (44px on phones); `aria-current` in nav; external links that open a new tab say so to screen readers; images need alt text (`coverAlt` is enforced).

## Gotchas (learned the hard way)

- **Astro 7:** import `z` from `astro/zod` (Zod 4; `z` from `astro:content` is deprecated); `defineCollection`/`reference`/`render` from `astro:content`; loaders from `astro/loaders`; config in `src/content.config.ts`.
- **TypeScript is pinned to 6.** `@astrojs/check` does not support TypeScript 7 yet.
- **Markdown plugins:** Astro 7's default processor is Sätteri, not unified/remark. `markdown.remarkPlugins`/`rehypePlugins` are ignored. Plugins go in `satteri({ mdastPlugins, hastPlugins })` in `astro.config.ts` (see `stripHtmlComments`, which keeps `<!-- notes -->` out of the published HTML, and `emptyHeaderCells`, which turns a table's empty corner `th` into a `td` so screen readers don't announce a nameless column).
- **Satori** (share images): every `div` with more than one child needs `display: flex`, and an element with no children must have `children: undefined` (satori treats `[]` as "several children"). It can't read woff2 or variable fonts: that's why `src/og-fonts/` exists (regenerate with `scripts/make-og-fonts.py` if the fonts change). Dotted `border` isn't supported; dotted `textDecoration` is. The stripe and mark are built from flex boxes (`stripe()`, `mark()` in `og.ts`).
- **Share-image covers** are read from `image().fsPath`, which Astro sets during the build.
- **Site URL:** `site.ts` `url` → else `VERCEL_PROJECT_PRODUCTION_URL` → else `http://localhost:4321`. Canonicals, OG image URLs, RSS, robots and the sitemap all follow it.
- **Analytics** (`@vercel/analytics/astro`) renders only when `VERCEL=1`, so local builds and Lighthouse runs don't request a script that 404s off Vercel.
- **The assessment's modules run in Node too** (its tests use Node's own runner, which strips TypeScript types itself): imports inside `src/assessment/` keep their `.ts` extensions, and nothing there may touch `import.meta.env` when it loads (`email.ts` reads it only inside a function, with `?.`).
- **Analytics and the #:** the Astro analytics component sends one page view per load (auto-tracking is off) and calls `window.webAnalyticsBeforeSend`, set in BaseLayout's inline script. The assessment adds one page view itself when someone finishes.
- **The dev server keeps its content store.** Astro 7 runs `astro dev` as a background daemon (`npx astro dev stop` stops it). After adding a field to a collection's schema, restart it, or the new field reads as `undefined` until you do.
- **Stopping a background dev/preview server:** `pkill -f` matches its own command line if the same shell command also contains the pattern; stop servers by PID or in a separate command.

## Before you push

1. `npm test` passes, and `npm run build` passes: 0 type errors, 0 warnings.
2. `npm run check:reviews` shows nothing unexpectedly due.
3. Look at changed pages at 375px and 1280px, in light and dark: no sideways scrolling, focus visible, stamps and pills readable.
4. Touched the playbook (its words, `src/pages/playbook.astro` or `src/playbook/playbook.css`)? Run `npm run playbook:pdf` and commit `public/playbook.pdf` and `src/playbook/pdf.json` with the change.
5. If you touched the content model, update `HOW-TO-ADD-CONTENT.md` and this file.

## Deploying

Vercel project with Root Directory `portfolio` (see `vercel.json`: `npm ci`, `npm run build`, output `dist`, no trailing slashes). Every push to `master` that changes `portfolio/` redeploys; `ignoreCommand` (`git diff --quiet HEAD^ HEAD -- .`, run from the Root Directory) exits 0 and skips the build when nothing here changed. If Vercel can't see the previous commit, the command fails and Vercel builds anyway, which is the safe direction. Turn on Web Analytics in the Vercel project once. The site lives at **https://www.georgeandersen.net** (the bare `georgeandersen.net` redirects to `www`), and `url` in `site.ts` is set to match; if the primary domain ever changes in Vercel, change `url` with it, or canonical links and share images will point at a redirect. Renamed pages keep their old address working through `redirects` in `vercel.json` (add one whenever a file in `src/content/` is renamed after launch, for the page and its `/og/…png` share image). The repository's other sites deploy from their own Vercel projects; the root `vercel.json` belongs to What Do I Actually Do? and must not be changed for this site. CI (`.github/workflows/portfolio-ci.yml`) runs the tests, type-checks and builds on every push and pull request that touches `portfolio/`; it never deploys.
