# How to add content

Everything on the site comes from Markdown files in `src/content/`, plus the site-wide text in `src/config/site.ts`. Adding something means adding **one file** (and, for a project, an optional image). You never need to touch pages or components. Two things are the exception, because their words are structured rather than prose: the assessment and the playbook each keep all their words in one file of their own (see "Edit the AI readiness assessment" and "Edit the playbook").

| To add a… | Create a file in… | It appears at… |
| --- | --- | --- |
| Project | `src/content/projects/` | `/projects/<file-name>`, on /projects, on its frameworks' pages, and on the home page if `featured: true` |
| Framework | `src/content/frameworks/` | `/frameworks/<file-name>`, on /frameworks (with its element tile) and the home page |
| Lab note (post) | `src/content/writing/` | `/writing/<file-name>`, on the Lab notes page, the home page, and under "Applied in" on any framework it names |
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
kind: "Workflow map"
time: "2 minutes"
action: "Map your work"
cover: ./your-project.png
coverAlt: "What the image shows, for people using screen readers."
frameworks: [fix-first-ai-last]
tags: [workflow, teams]
featured: false
order: 3
---

## Hypothesis

The claim this project tests, in one sentence you could be wrong about. Then a short paragraph on why it matters.

## Method

What you built and how it works, as a short intro and a list.

## Result

What happened: where it's live, and anything you can measure or quote.

## What I'd change
```

- **Every project is written up as an experiment.** The four headings are numbered on the page (01 Hypothesis, 02 Method, …), and the first sentence under Hypothesis is set larger, as the claim. Keep the claim testable: "People trust AI more carefully after they measure their own overconfidence" can be wrong; "AI literacy matters" can't.

- **status** is `live`, `in progress` or `archived`. A live project needs its `liveUrl`. When that address is a page on this site (like the assessment), its button opens in the same tab; another site opens in a new one.
- **kind**, **time** and **action** are optional. **kind** is what it is in a word or two ("Self-assessment", "Interactive essay") and **time** how long it takes; both show above the title on its card. **action** is the button's words; start with a verb ("Take the assessment", "Read the essay"). Without it, the button says "Open the project".
- **frameworks** lists the frameworks it puts into practice, by file name without `.md` (look in `src/content/frameworks/`). The framework's page lists the project automatically; you don't edit the framework.
- **cover** is optional. Save the image next to the Markdown file. Wide images work best (1200 × 630 is ideal); the project's own share image or a screenshot of its first screen are good choices. If you add a cover, add `coverAlt` too.
- **note** is optional: a sentence or two shown under the summary on the project's page, such as how it was made (`note: "This one is almost entirely done by AI…"`).
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
failureModes:
  - name: "A short name for one way it can fail"
    risk: "What goes wrong, in a sentence or two."
    precaution: "What to do about it, in a sentence or two."
  - name: "Another way it can fail"
    risk: "What goes wrong."
    precaution: "What to do about it."
---

## The idea

## Why it works
```

- **failureModes** is required: every framework says how it can fail. They appear at the end of its page as the "Failure modes" safety sheet, each split into the risk and the precaution. Add as many as you need; each one starts with `  - name:`, and the lines under it are indented to match.
- **order** sets its place and its number (1, 2, 3…) on the home page and /frameworks.
- **Its element tile** (like **Ct** for Calibrated Trust) is made from the first letters of the title's first two words, skipping "AI". To choose your own, add `symbol: "Ts"`: one capital letter, then an optional lowercase one. Two frameworks can't share a symbol; the build says so if they would.
- **reaction** (optional) shows a formula under the thesis, like the one on AI Should Be Boring:

  ```markdown
  reaction:
    inputs: ["Clear scope", "Measurement", "An owner"]
    output: "AI you can rely on"
  ```
- **lastReviewed** is the last time you re-read it and still stood behind it. After 180 days its stamp turns amber and says "may be out of date". Run `npm run check:reviews` to see what's due.
- If a new framework changes the count, update the "Four methods…" sentence (`methodsIntro`) in `site.ts`.

## Add a lab note

Posts are called lab notes on the site. Copy this into `src/content/writing/your-post.md`:

```markdown
---
title: "Post title"
date: 2026-10-15
summary: "One or two sentences, shown in lists and link previews."
frameworks: [calibrated-trust]
tags: [ai-strategy]
---

Write here. Blank lines separate paragraphs. **Bold**, *italic*, [links](https://example.com),
lists that start with "- ", and headings that start with "## " all work.
```

**Who writes lab notes:** you do. The Lab notes page promises they're *mostly you*, with AI used only for basic editing and polish, and that you'll say so when a note breaks that promise. Don't publish a note AI drafted; rewrite it in your own words first, or say in the note how it was made. (The promise is in `sections.writing.note` in `site.ts`.)

**summary** is optional. With one, it shows under the title and in the Lab notes list. Leave the line out to publish the note exactly as written, with no subtitle; search results and link previews then use its opening sentences.

**frameworks** is optional too: list the frameworks the note applies, by file name, the same way projects do. Each shows as a tag at the top of the note (like **Ct** Calibrated Trust), and the note appears under "Applied in" on that framework's card and page automatically. You don't edit the framework.

Lab notes are numbered automatically by date: the oldest is Entry 001. Optionally add `lastReviewed: 2026-12-01` when you revisit a note; its stamp shows that date instead of the publish date.

## Edit the AI readiness assessment

"How Boring Is Your AI?" (`/tools/how-boring-is-your-ai`, listed under Projects) keeps its words out of Markdown, like the playbook, because its questions are structured: every question has four answers, scored 0 to 3 in order. **All of its words are in `src/assessment/content.ts`**: the questions and answers, the four stages, the next steps, the results page and every button. The top of that file explains the few rules (keep the `{placeholders}`; keep four answers per question, least ready first).

- **Drafts:** words you haven't rewritten in your own voice yet are marked `// TODO REVIEW`. Run `npm run drafts` to list them, and delete a marker once the words under it sound like you.
- **Check it:** run `npm test`. It says what to fix if a question lost an answer, a placeholder is misspelled, or a word slipped in that doesn't belong (emoji, hype words, comparisons with other companies).
- **Reordering:** a shared result stores each answer's position. If you add, remove or reorder questions or answers, add one to `shareVersion` in the same file, so older links show a short notice instead of answers read wrong. Rewording doesn't need it.
- **The home button** that leads to it ("How boring is your AI?") is `thesis.cta` in `src/config/site.ts`; set it to `null` to remove it.
- **The playbook follows it.** Each of its six plays answers one of the six dimensions, and lists the top answer to each question. If you add, remove or rename a dimension or a question, update `src/playbook/content.ts` too; `npm test` says what's out of step.

### Turn on the email form

The results page can offer "Email me this result" with an optional, unticked box for occasional notes. It stays hidden until an email service is connected, so nobody sees a form that can't send. It shows in `npm run dev`, where it only logs what it would send. To connect a service:

1. Make an endpoint that sends the email. Either a Vercel Function (`api/email-result.ts` in `portfolio/`, using an email service such as [Resend](https://resend.com) with its key in the Vercel project's Environment Variables), or a no-code webhook from Zapier, Make or n8n that sends the email and adds the address to your newsletter tool. It receives JSON: `email`, `wantsNotes` (true only if they ticked the box), `resultUrl` and a short `summary`. Only ever send the result link to the address given, and add a rate limit (Vercel Firewall → Rate Limiting) so nobody can use the form to send hundreds of emails.
2. In `src/assessment/email.ts`, change the last line to point at it: `export const emailAdapter: EmailAdapter = postJsonAdapter('/api/email-result');`
3. Before you publish: reread the consent text and the "a few a year" promise in `content.ts` (`email`), use double opt-in for the notes, and update the footer's privacy line (`footer.privacy` in `site.ts`), since answers no longer stay only in the browser for someone who emails themselves.

## Edit the playbook

The playbook, "What boring AI looks like" (`/playbook`), is a two-page guide written for someone who has never seen your site: why "boring", the first 90 days, six plays, the responsible-AI rules, the AI champion network and who made it. **All of its words are in `src/playbook/content.ts`**, apart from the framework names in its footer. The top of that file explains the rules. Keep it self-contained: if a word only makes sense after reading the rest of the site, explain it or leave it out.

- **Drafts:** words you haven't rewritten in your own voice are marked `// TODO REVIEW`. `npm run drafts` lists them, with the assessment's.
- **Check it:** run `npm test`. It says what to fix if the plays fall out of step with the assessment (one play per dimension, one "working" sign per question, in the same order), if it no longer reads in the five minutes its kicker promises, or if a hype word slipped in.
- **The PDF:** the "Download the PDF" button serves `public/playbook.pdf`, which is the page itself, printed. After changing the playbook, run `npm run playbook:pdf`, then commit `public/playbook.pdf` and `src/playbook/pdf.json` with your change. Until you do, the page swaps the download for "Print or save as PDF", so nobody gets a PDF that disagrees with the page. On a new computer, run `npx playwright-core install chromium` once first.
- **Two pages:** the script stops if the PDF comes out longer than two pages. Shorten something, or ask for the print layout to be adjusted.
- **The update date** at its foot is `updated` at the top of the file. Change it when you change the words.

## Add a page (for example, "Work with me")

1. Copy this into `src/content/pages/work-with-me.md`:

   ```markdown
   ---
   title: "Work with me"
   description: "One sentence for search engines and link previews."
   ---

   Write the page here.
   ```

2. In `src/config/site.ts`, add `{ label: 'Work with me', href: '/work-with-me' }` to `nav`. The menu fits five short labels in one row on a phone, and it has five now, so swap one out (the contact button is a good home for it) or have the header re-measured for a sixth. To add a button to the contact section, set `cta: { label: 'Work with me', href: '/work-with-me' }`.

A page can also show a photo beside its title, as the About page does. Put the image in `src/assets/` and add two lines to the top section (the second describes the photo for screen readers; the build stops if it's missing):

```markdown
image: ../../assets/george-andersen.jpg
imageAlt: "George Andersen"
```

## Change your photo

Your headshot is `src/assets/george-andersen.jpg`. It appears at the top of the home page, beside the headline, and on the About page. To change it, replace that file with a new photo of the same name (a square crop, at least 800 pixels wide, looks sharpest). The site shows it in black and white, so any color photo works.

## Change site-wide text

Your name, role, the line above the home headline ("AI today is {magic} alchemy.", where a word in {braces} is shown crossed out), the headline and introduction, section names and titles, the short bio (and the photo's description), the career diagram beside it (`path` and `throughLine`), the LinkedIn link, the footer notes and the 180-day review window are all in **`src/config/site.ts`**. Change the words between the quotes and save. Your address, `url`, is set to `https://www.georgeandersen.net`; change it only if you move the site to another domain.

## Notes to yourself

Anything between `<!--` and `-->` in a Markdown file is removed from the published site, so you can leave yourself reminders like `<!-- add the Q3 results -->`.

## When the build stops

The message names the file and what to fix. The three you're most likely to see:

- **`summary: Required: one line describing the project…`**: a field is missing or spelled differently. Compare with the template.
- **`Broken content link … "frameworks" lists "calibrated-trsut" … Did you mean "calibrated-trust"?`**: a framework or project name doesn't match a file name.
- **`bad indentation of a mapping entry`** (with a file name and line number): a line in the top section has a colon in its text, or quotation marks inside quotation marks. Put the text in quotes: `title: "Risk: a primer"`. The templates already quote every text field. If the text itself needs quotation marks, type curly ones (“ ”) inside the straight ones: `name: "“Boring” can become an excuse"`.
- **`Two frameworks would share the element symbol "Ct"`**: give one of them its own `symbol`, as the message suggests.

Dates are always written `2026-10-15`. Straight quotes are fine; the site turns them into curly ones.
