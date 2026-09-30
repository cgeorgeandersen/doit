# How to add content

Everything on the site comes from Markdown files in `src/content/`, plus the site-wide text in `src/config/site.ts`. Adding something means adding **one file** (and, for a project, an optional image). You never need to touch pages or components.

| To add a… | Create a file in… | It appears at… |
| --- | --- | --- |
| Project | `src/content/projects/` | `/projects/<file-name>`, on /projects, on its frameworks' pages, and on the home page if `featured: true` |
| Framework | `src/content/frameworks/` | `/frameworks/<file-name>`, on /frameworks and the home page |
| Post | `src/content/writing/` | `/writing/<file-name>`, on /writing and the home page |
| Page | `src/content/pages/` | `/<file-name>` (add it to the menu in `site.ts`) |

**File names become web addresses**, so use lowercase words joined by hyphens: `meeting-cost-calculator.md`.

## The workflow

1. **Once, on a new computer:** install [Node.js 22](https://nodejs.org), then in a terminal run `cd portfolio` and `npm ci`.
2. **Preview:** run `npm run dev` and open http://localhost:4321. The page updates every time you save a file. Stop it with Ctrl+C.
3. **Check:** run `npm run build`. If anything is missing or misspelled, it stops and tells you the file, the field and the fix (see "When the build stops" below).
4. **Publish:** commit and push to `master`. Vercel rebuilds the site in about a minute.

## Add a project

Copy this into `src/content/projects/your-project.md`:

```markdown
---
title: "Project name"
summary: "One line: what it is and who it's for. Under 160 characters."
status: live
date: 2026-10-15
liveUrl: "https://example.com"
cover: ./your-project.png
coverAlt: "What the image shows, for people using screen readers."
frameworks: [fix-first-ai-last]
tags: [workflow, teams]
featured: false
order: 3
---

## The problem

## What I built

## Design decisions

## What I learned
```

- **status** is `live`, `in progress` or `archived`. A live project needs its `liveUrl`.
- **frameworks** lists the frameworks it puts into practice, by file name without `.md` (look in `src/content/frameworks/`). The framework's page lists the project automatically; you don't edit the framework.
- **cover** is optional. Save the image next to the Markdown file. Wide images work best (1200 × 630 is ideal); the project's own share image or a screenshot of its first screen are good choices. If you add a cover, add `coverAlt` too.
- **featured: true** puts it on the home page. **order** sorts projects: lower numbers first.
- Add `draft: true` to keep a project off the published site while you work on it. Drafts still show in `npm run dev`.

## Add a framework

Copy this into `src/content/frameworks/your-framework.md`:

```markdown
---
title: "Framework name"
thesis: "The idea in one line, under 200 characters."
question: "The question it answers, e.g. Where does AI fit in the work?"
date: 2026-10-15
lastReviewed: 2026-10-15
order: 4
---

## The idea

## Why it works

## Where it breaks down
```

- **order** sets its place and its number (01, 02, 03…) on the home page and /frameworks.
- **lastReviewed** is the last time you re-read it and still stood behind it. After 180 days its stamp turns amber and says "may be out of date". Run `npm run check:reviews` to see what's due.
- If a new framework changes the count, update the "Three methods…" sentence (`methodsIntro`) in `site.ts`.

## Add a post

Copy this into `src/content/writing/your-post.md`:

```markdown
---
title: "Post title"
date: 2026-10-15
summary: "One or two sentences, shown in lists and link previews."
tags: [ai-strategy]
---

Write here. Blank lines separate paragraphs. **Bold**, *italic*, [links](https://example.com),
lists that start with "- ", and headings that start with "## " all work.
```

Optionally add `lastReviewed: 2026-12-01` when you revisit a post; its stamp shows that date instead of the publish date.

## Add a page (for example, "Work with me")

1. Copy this into `src/content/pages/work-with-me.md`:

   ```markdown
   ---
   title: "Work with me"
   description: "One sentence for search engines and link previews."
   ---

   Write the page here.
   ```

2. In `src/config/site.ts`, add `{ label: 'Work with me', href: '/work-with-me' }` to `nav`. To add a button to the contact section too, set `cta: { label: 'Work with me', href: '/work-with-me' }`.

A page can also show a photo beside its title, as the About page does. Put the image in `src/assets/` and add two lines to the top section (the second describes the photo for screen readers; the build stops if it's missing):

```markdown
image: ../../assets/george-andersen.jpg
imageAlt: "George Andersen"
```

## Change your photo

Your headshot is `src/assets/george-andersen.jpg`. It appears on the home page and the About page. To change it, replace that file with a new photo of the same name (a square crop, at least 800 pixels wide, looks sharpest). The site shows it in black and white, so any color photo works.

## Change site-wide text

Your name, role, the home page headline and introduction, section titles, the short bio (and the photo's description), the LinkedIn link, the footer notes and the 180-day review window are all in **`src/config/site.ts`**. Change the words between the quotes and save. When you connect a domain, set `url` there (for example `'https://georgeandersen.com'`).

## Notes to yourself

Anything between `<!--` and `-->` in a Markdown file is removed from the published site, so you can leave yourself reminders like `<!-- add the Q3 results -->`.

## When the build stops

The message names the file and what to fix. The three you're most likely to see:

- **`summary: Required: one line describing the project…`**: a field is missing or spelled differently. Compare with the template.
- **`Broken content link … "frameworks" lists "calibrated-trsut" … Did you mean "calibrated-trust"?`**: a framework or project name doesn't match a file name.
- **`bad indentation of a mapping entry`** (with a file name and line number): a line in the top section has a colon in its text. Put the text in quotes: `title: "Risk: a primer"`. The templates already quote every text field.

Dates are always written `2026-10-15`. Straight quotes are fine; the site turns them into curly ones.
