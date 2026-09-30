# George Andersen's portfolio: guide for maintainers

A static Astro site: George's frameworks for making AI useful ("theory") and the live projects that prove them ("proof"). The audience is hiring managers and executives first, consulting clients later. The philosophy the site argues for is **"AI should be boring"**: production over pilots, measured results over demos, fit before tools, trust calibrated to reliability. Always phrase it that way, never as "Make AI boring": that construction echoes a political slogan, and it was renamed for that reason (the old `/frameworks/make-ai-boring` address redirects, see `vercel.json`). The site should practice it too: plain, current, honest about its gaps.

The owner is not a full-time developer. **Adding a project, framework, post or page must stay one Markdown file (plus an optional image)**, with no edits to components, layouts or routing. Protect that above everything else. `HOW-TO-ADD-CONTENT.md` is the owner's guide; keep it in sync with any change to the content model.

## Commands (run in `portfolio/`, Node 22)

```bash
npm ci                   # install
npm run dev              # http://localhost:4321, drafts visible
npm run build            # astro check (types) + static build to dist/; must pass with 0 errors
npm run preview          # serve dist/
npm run check:reviews    # frameworks/posts past the 180-day review window (--strict exits 1)
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
  src/styles/              tokens.css (palette, type, spacing) and global.css (base, prose, layout)
  src/layouts/BaseLayout.astro   head, fonts, theme pre-paint, header, footer, analytics
  src/components/          SiteHeader, SiteFooter, ThemeToggle, ReviewStamp, StatusPill, ProjectCard,
                           FrameworkCard, ElementTile, FailureModes, LinkPreview, ProjectFilter, PostList,
                           ContactBand, ThroughLine, Seo
  src/pages/               index, 404, [page] (About etc.), projects/, frameworks/, writing/,
                           rss.xml.ts, robots.txt.ts, og/[...route].png.ts
  scripts/                 check-reviews.mjs, make-og-fonts.py (one-time)
```

## Content model

Four collections (`src/content.config.ts`), each a folder of `.md` files; the file name is the id and the URL slug.

| Collection | Required fields | Optional fields |
| --- | --- | --- |
| `projects` | `title`, `summary` (≤160), `status` (`live` / `in progress` / `archived`), `date` | `tags`, `cover` + `coverAlt`, `liveUrl` (required if live), `frameworks` (references), `featured`, `order` (default 100), `draft` |
| `frameworks` | `title`, `thesis` (≤200), `date`, `lastReviewed`, `failureModes` (≥1 × `name` / `risk` / `precaution`) | `relatedProjects`, `kind` (`method` / `philosophy`), `question`, `order`, `symbol` (`Ct`), `reaction` (`inputs` ≥2, `output`), `draft` |
| `writing` (shown as "Lab notes") | `title`, `date`, `summary` | `tags`, `lastReviewed`, `draft` |
| `pages` | `title`, `description` | `image` + `imageAlt` (a photo beside the title), `draft` |

Rules that matter:

- **The project ↔ framework link is stored once, on the project** (`frameworks: [...]`). A framework's "Applied in" list is derived in `getSite().projectsFor()`. Never add a second, hand-maintained list; `relatedProjects` exists only for projects that are related without formally applying the framework, shown separately as "Related".
- **Numbering:** frameworks with `kind: method` are numbered 1, 2… by `order`; the one with `kind: philosophy` (AI Should Be Boring, symbol **Bo**, set in its frontmatter because the derived **Sb** is antimony) is element 0, frames the others and is linked from the home hero. `getSite().elementOf()` gives a framework's number, kind and symbol; `symbolOf()` makes the symbol from the title (first letters of the first two words, skipping "AI" and small words) unless the file sets `symbol`. `checkSymbols()` fails the build if two frameworks would share one.
- **Lab notes** are the `writing` collection under another name: the URL stays `/writing`, the words come from `SITE.sections.writing` and `nav`. `getSite().entryOf()` numbers them 001, 002… from the oldest, so backdating a post renumbers the ones after it.
- **Always read content through `getSite()`**, not `getCollection()` directly: it drops drafts in builds, sorts, and runs the link checks.
- **Link checks:** Astro 7 only logs a misspelled `reference()` and exits 0. `checkLinks()` in `src/lib/content.ts` throws instead, naming the file and suggesting the closest id. Keep it.
- **Error messages are part of the UX.** Every schema field uses `explain()` so a missing field reads "summary: Required: one line describing the project, under 160 characters". Keep new fields to the same standard.
- **Drafts** (`draft: true`) render in `npm run dev` with a "Draft · not published" label and are excluded from builds, feeds, sitemap and share images.
- **Standalone pages:** any file in `src/content/pages/` becomes `/<id>` via `src/pages/[page].astro`. Slugs that would shadow a section (`projects`, `frameworks`, `writing`, `og`, …) fail the build.

### Adding each type (the owner's templates are in HOW-TO-ADD-CONTENT.md)

- **Project:** `src/content/projects/<slug>.md` (+ optional `<slug>.png` cover next to it). Link frameworks by file name. The body is an experiment write-up with four `##` sections, numbered by CSS on the project page: Hypothesis (its first paragraph is the claim, set as a lede) / Method / Result / What I'd change.
- **Framework:** `src/content/frameworks/<slug>.md` with two body sections, The idea / Why it works, and its failure modes in frontmatter (rendered by `FailureModes.astro` after the body). An opening paragraph before the first heading is set as a lede (AI Should Be Boring uses this for the alchemy history). If the number of methods changes, update `home.methodsIntro` in `site.ts` (it says "Three methods").
- **Lab note:** `src/content/writing/<slug>.md`.
- **Page:** `src/content/pages/<slug>.md`, then a `nav` entry in `site.ts` (and optionally `contact.cta`).
- **A new content type** (rare): add a collection with `explain()` messages, load it in `getSite()`, add index/detail pages, add share-image cards in `src/pages/og/[...route].png.ts`, add it to RSS if it's dated, and document it in both guides.

## Design system: "Studio"

Clean and modern with a controlled burst of color: a white page, near-black type, and four framework colors that do real work (they tell you which framework you're looking at). Business-first, not a template: no stock gradients, no illustrations, no shadows everywhere.

**Palette** (`src/styles/tokens.css`; dark values redefined twice, for the OS setting and for `data-theme="dark"`, so the toggle wins both ways):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` / `--paper-2` / `--paper-3` | `#ffffff` / `#f4f5f7` / `#e9ebef` | `#0e1014` / `#171a20` / `#20242b` | page / cards / wells |
| `--ink` / `--ink-2` / `--ink-3` | `#111318` / `#3e4450` / `#5c6370` | `#eef0f4` / `#b9bfca` / `#8e95a3` | text / secondary / metadata |
| `--rule` / `--rule-strong` | `#e2e5ea` / `#c9ced6` | `#262a33` / `#3a404b` | hairlines, card borders |
| `--fw-0` (violet) | `#6b45f0` | `#9d80ff` | the philosophy (AI Should Be Boring) |
| `--fw-1` (cobalt) | `#2759f5` | `#6e8fff` | method 1, 4, 7…; also `--accent` (links, focus ring) |
| `--fw-2` (coral) | `#f2553a` | `#ff7a62` | method 2, 5…; also the hazard label on Failure modes |
| `--fw-3` (teal) | `#0fa08e` | `#2ccdb8` | method 3, 6… |
| `--fw-N-ink` | darker / lighter twins | | the same colors when used as **text** (AA on paper) |
| `--fresh` | `#0a7568` | `#2ccdb8` | the review stamp's "current" dot |
| `--stale` / `--stale-ink` | `#ad721c` / `#7b510d` | `#c3862e` / `#deae62` | **amber, reserved for "may be out of date"** |

- **Framework colors are assigned, not chosen.** `getSite().colorOf(framework)` returns the slot: 0 for the philosophy, then methods cycle 1 → 2 → 3 by their order. Put `data-fw={colorOf(f)}` on an element and use `var(--fw)` (marks) / `var(--fw-ink)` (text) inside it. A new framework gets its color automatically; never hard-code one.
- **The four-color stripe** (violet / cobalt / coral / teal, equal quarters) is the signature: under "boring." in the hero, under the headshot, on share images. The **four-dot mark** (two by two) is the logo in the header, favicon and share-image kicker.
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

Keep it that way: no beakers, flasks, smoke, explosions or other clip art; no parchment, gold or "magic" styling (except the struck-out word); and don't rename the plain sections (Projects, Frameworks, About). One well-placed metaphor is intriguing; a costume isn't. Every lab element must also make the content clearer: a testable hypothesis, a precaution per risk, a dated entry.

**Layout:** `.wide` (70rem) for page structure, `.measure` (38rem) for reading; detail pages use `.detail` (text column + a margin column on ≥1100px; margin column first on phones). 16px minimum gutters; nothing may scroll sideways at 320px. Corners: `--radius` 12px, cards 16px, buttons 10px.

**Motion:** one entrance on the home hero, hover transitions, all disabled under `prefers-reduced-motion`. The hero headline only moves, never starts invisible (it's the LCP element).

**Never:** stock gradients (the stripe is hard-edged, not a gradient blend), hero illustrations, laboratory clip art, emoji, a fifth decorative color, drop shadows everywhere.

## Conventions

- Site-wide words live in `site.ts`; content words live in Markdown. Don't hard-code either in components (including George's name: use `SITE.name`).
- Dates in frontmatter are calendar days parsed as UTC midnight. Format them with `src/lib/dates.ts` (UTC), never `toLocaleDateString()` without `timeZone: 'UTC'`, or they show a day early in the Americas.
- Text fields in frontmatter pass through `typeset()` (curly quotes); Markdown bodies get smart punctuation from the processor.
- Scripts are small, framework-free, and progressive enhancement: the page must work and read fully without JavaScript (the theme toggle and filters hide themselves when JS is off).
- Keep dependencies minimal. There is no CMS, database, backend or UI framework, and there shouldn't be.
- Accessibility bar: semantic landmarks and one `h1` per page; visible `:focus-visible` ring; 24px+ targets (44px on phones); `aria-current` in nav; external links that open a new tab say so to screen readers; images need alt text (`coverAlt` is enforced).

## Gotchas (learned the hard way)

- **Astro 7:** import `z` from `astro/zod` (Zod 4; `z` from `astro:content` is deprecated); `defineCollection`/`reference`/`render` from `astro:content`; loaders from `astro/loaders`; config in `src/content.config.ts`.
- **TypeScript is pinned to 6.** `@astrojs/check` does not support TypeScript 7 yet.
- **Markdown plugins:** Astro 7's default processor is Sätteri, not unified/remark. `markdown.remarkPlugins`/`rehypePlugins` are ignored. Plugins go in `satteri({ mdastPlugins, hastPlugins })` in `astro.config.ts` (see `stripHtmlComments`, which keeps `<!-- notes -->` out of the published HTML).
- **Satori** (share images): every `div` with more than one child needs `display: flex`, and an element with no children must have `children: undefined` (satori treats `[]` as "several children"). It can't read woff2 or variable fonts: that's why `src/og-fonts/` exists (regenerate with `scripts/make-og-fonts.py` if the fonts change). Dotted `border` isn't supported; dotted `textDecoration` is. The stripe and mark are built from flex boxes (`stripe()`, `mark()` in `og.ts`).
- **Share-image covers** are read from `image().fsPath`, which Astro sets during the build.
- **Site URL:** `site.ts` `url` → else `VERCEL_PROJECT_PRODUCTION_URL` → else `http://localhost:4321`. Canonicals, OG image URLs, RSS, robots and the sitemap all follow it.
- **Analytics** (`@vercel/analytics/astro`) renders only when `VERCEL=1`, so local builds and Lighthouse runs don't request a script that 404s off Vercel.
- **Stopping a background dev/preview server:** `pkill -f` matches its own command line if the same shell command also contains the pattern; stop servers by PID or in a separate command.

## Before you push

1. `npm run build` passes: 0 type errors, 0 warnings.
2. `npm run check:reviews` shows nothing unexpectedly due.
3. Look at changed pages at 375px and 1280px, in light and dark: no sideways scrolling, focus visible, stamps and pills readable.
4. If you touched the content model, update `HOW-TO-ADD-CONTENT.md` and this file.

## Deploying

Vercel project with Root Directory `portfolio` (see `vercel.json`: `npm ci`, `npm run build`, output `dist`, no trailing slashes). Every push to `master` that changes `portfolio/` redeploys; `ignoreCommand` (`git diff --quiet HEAD^ HEAD -- .`, run from the Root Directory) exits 0 and skips the build when nothing here changed. If Vercel can't see the previous commit, the command fails and Vercel builds anyway, which is the safe direction. Turn on Web Analytics in the Vercel project once. The site lives at **https://www.georgeandersen.net** (the bare `georgeandersen.net` redirects to `www`), and `url` in `site.ts` is set to match; if the primary domain ever changes in Vercel, change `url` with it, or canonical links and share images will point at a redirect. Renamed pages keep their old address working through `redirects` in `vercel.json` (add one whenever a file in `src/content/` is renamed after launch, for the page and its `/og/…png` share image). The repository's other two sites deploy from their own Vercel projects; the root `vercel.json` belongs to What Do I Actually Do? and must not be changed for this site. CI (`.github/workflows/portfolio-ci.yml`) type-checks and builds on every push and pull request that touches `portfolio/`; it never deploys.
