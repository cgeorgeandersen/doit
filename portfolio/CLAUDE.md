# George Andersen's portfolio: guide for maintainers

A static Astro site: George's frameworks for making AI useful ("theory") and the live projects that prove them ("proof"). The audience is hiring managers and executives first, consulting clients later. The philosophy the site argues for is **"Make AI boring"**: production over pilots, measured results over demos, fit before tools, trust calibrated to reliability. The site should practice it too: plain, current, honest about its gaps.

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
  src/lib/content.ts       getSite(): loads, filters drafts, sorts, derives links, checks links
  src/lib/dates.ts         UTC-safe formatting and the review-window test
  src/lib/status.ts        project statuses (shared by schema, pill, filter)
  src/lib/typeset.ts       curly quotes for frontmatter text
  src/lib/og.ts            share-image renderer (satori + sharp)
  src/og-fonts/            static font cuts for share images (build-time only) + OFL licences
  src/styles/              tokens.css (palette, type, spacing) and global.css (base, prose, layout)
  src/layouts/BaseLayout.astro   head, fonts, theme pre-paint, header, footer, analytics
  src/components/          SiteHeader, SiteFooter, ThemeToggle, ReviewStamp, StatusPill, ProjectCard,
                           FrameworkCard, LinkPreview, ProjectFilter, PostList, ContactBand, Seo
  src/pages/               index, 404, [page] (About etc.), projects/, frameworks/, writing/,
                           rss.xml.ts, robots.txt.ts, og/[...route].png.ts
  scripts/                 check-reviews.mjs, make-og-fonts.py (one-time)
```

## Content model

Four collections (`src/content.config.ts`), each a folder of `.md` files; the file name is the id and the URL slug.

| Collection | Required fields | Optional fields |
| --- | --- | --- |
| `projects` | `title`, `summary` (≤160), `status` (`live` / `in progress` / `archived`), `date` | `tags`, `cover` + `coverAlt`, `liveUrl` (required if live), `frameworks` (references), `featured`, `order` (default 100), `draft` |
| `frameworks` | `title`, `thesis` (≤200), `date`, `lastReviewed` | `relatedProjects`, `kind` (`method` / `philosophy`), `question`, `order`, `draft` |
| `writing` | `title`, `date`, `summary` | `tags`, `lastReviewed`, `draft` |
| `pages` | `title`, `description` | `draft` |

Rules that matter:

- **The project ↔ framework link is stored once, on the project** (`frameworks: [...]`). A framework's "Applied in" list is derived in `getSite().projectsFor()`. Never add a second, hand-maintained list; `relatedProjects` exists only for projects that are related without formally applying the framework, shown separately as "Related".
- **Numbering:** frameworks with `kind: method` are numbered 01, 02… by `order`. The one with `kind: philosophy` (Make AI Boring) frames the others and is linked from the home hero.
- **Always read content through `getSite()`**, not `getCollection()` directly: it drops drafts in builds, sorts, and runs the link checks.
- **Link checks:** Astro 7 only logs a misspelled `reference()` and exits 0. `checkLinks()` in `src/lib/content.ts` throws instead, naming the file and suggesting the closest id. Keep it.
- **Error messages are part of the UX.** Every schema field uses `explain()` so a missing field reads "summary: Required: one line describing the project, under 160 characters". Keep new fields to the same standard.
- **Drafts** (`draft: true`) render in `npm run dev` with a "Draft · not published" label and are excluded from builds, feeds, sitemap and share images.
- **Standalone pages:** any file in `src/content/pages/` becomes `/<id>` via `src/pages/[page].astro`. Slugs that would shadow a section (`projects`, `frameworks`, `writing`, `og`, …) fail the build.

### Adding each type (the owner's templates are in HOW-TO-ADD-CONTENT.md)

- **Project:** `src/content/projects/<slug>.md` (+ optional `<slug>.png` cover next to it). Link frameworks by file name.
- **Framework:** `src/content/frameworks/<slug>.md` with the three body sections: The idea / Why it works / Where it breaks down. If the number of methods changes, update `home.methodsIntro` in `site.ts` (it says "Three methods").
- **Post:** `src/content/writing/<slug>.md`.
- **Page:** `src/content/pages/<slug>.md`, then a `nav` entry in `site.ts` (and optionally `contact.cta`).
- **A new content type** (rare): add a collection with `explain()` messages, load it in `getSite()`, add index/detail pages, add share-image cards in `src/pages/og/[...route].png.ts`, add it to RSS if it's dated, and document it in both guides.

## Design system

The site deliberately shares The Confident Machine's design language (`../confident-machine/DESIGN.md` §5, `../confident-machine/src/styles/tokens.css`): editorial, literate, a research publication rather than a template.

**Palette** (`src/styles/tokens.css`; dark values redefined twice, for the OS setting and for `data-theme="dark"`, so the toggle wins both ways):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` / `--paper-2` / `--paper-3` | `#faf9f5` / `#f1efe8` / `#e7e4db` | `#141413` / `#1c1c1a` / `#262623` | page / cards / wells |
| `--ink` / `--ink-2` / `--ink-3` | `#191a1c` / `#45464b` / `#6a6b70` | `#e6e4dc` / `#b3b1a8` / `#8a8880` | text / secondary / metadata (≥4.6:1 on cards) |
| `--rule` / `--rule-strong` | `#dedbd2` / `#c5c1b6` | `#2c2c29` / `#403f3a` | hairlines |
| `--accent` / `--accent-ink` | `#08856a` / `#16674f` | `#33a987` / `#61c8a4` | **the one accent (jade)**: link underlines, dots, numerals, focus ring |
| `--stale` / `--stale-ink` | `#ad721c` / `#7b510d` | `#c3862e` / `#deae62` | **amber, reserved for "may be out of date"** |

- **One accent.** Jade is the only decorative color. Amber appears only on overdue review stamps (and draft labels in dev); using it anywhere else would drain the warning of meaning.
- **Color never carries meaning alone:** stamps pair the dot with words; status pills use ● / ◐ / ○ plus a label; pressed filter chips are filled and carry a ✓.
- All text tokens pass WCAG AA on both surfaces in both themes. Re-check contrast if you change a token.

**Type:** Bodoni Moda (variable, optical sizes) for display only, never below ~1.25rem; Newsreader for text (19px phones / 20px desktop, 1.6 line height, `--measure: 38rem`); IBM Plex Mono for kickers, labels, dates, stamps, buttons (uppercase + tracking for labels). Fonts are self-hosted from Fontsource and imported in `BaseLayout.astro`; the Bodoni and Newsreader latin files are preloaded. Newsreader uses its weight-only file (58 KB vs 132 KB with the optical-size axis, which sits at its default at body sizes anyway).

**Signature details:** the dotted jade underline (hero "boring", echoing the essay's masthead); the review stamp (`ReviewStamp.astro`), green dot → amber after `review.staleAfterDays` (180), computed at build *and* re-checked in the browser so it stays honest without rebuilds; mono kickers separated by dots (the `.kicker` clip trick prevents a stray leading dot on wrapped lines).

**Layout:** `.wide` (68rem) for page structure, `.measure` (38rem) for reading; detail pages use `.detail` (text column + a margin column on ≥1100px; margin column first on phones). 16px minimum gutters; nothing may scroll sideways at 320px.

**Motion:** one entrance on the home hero, hover transitions, all disabled under `prefers-reduced-motion`. The hero headline only moves, never starts invisible (it's the LCP element).

**Never:** stock gradients, hero illustrations, emoji, a second accent, SaaS-style cards with drop shadows everywhere.

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
- **Bodoni Moda's hyphens and dashes are ~0.2px hairlines** at every optical size, so they vanish on screen. `BaseLayout.astro` declares a `Display Dashes` face (Newsreader's file, `unicode-range` limited to dashes) placed first in `--font-display`. Don't remove it. Share images do the same by setting dashes in Newsreader.
- **Satori** (share images): every `div` with more than one child needs `display: flex`, and an element with no children must have `children: undefined` (satori treats `[]` as "several children"). It can't read woff2 or variable fonts: that's why `src/og-fonts/` exists (regenerate with `scripts/make-og-fonts.py` if the fonts change). Dotted `border` isn't supported; dotted `textDecoration` is.
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

Vercel project with Root Directory `portfolio` (see `vercel.json`: `npm ci`, `npm run build`, output `dist`, no trailing slashes). Every push to `master` redeploys. Turn on Web Analytics in the Vercel project once. After connecting a domain, set `url` in `site.ts`. The repository's other two sites deploy from their own Vercel projects; the root `vercel.json` belongs to What Do I Actually Do? and must not be changed for this site. CI (`.github/workflows/portfolio-ci.yml`) type-checks and builds on every push and pull request that touches `portfolio/`; it never deploys.
