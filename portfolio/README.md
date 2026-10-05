# George Andersen: portfolio

Frameworks for making AI useful, the live projects that prove them, and free tools that put them to work, including an AI readiness self-assessment, [How Boring Is Your AI?](https://www.georgeandersen.net/tools/how-boring-is-your-ai). A static site built with [Astro](https://astro.build): no backend, no database, no CMS, no cookies.

- **Adding content:** [`HOW-TO-ADD-CONTENT.md`](HOW-TO-ADD-CONTENT.md): one Markdown file per project, framework, post, tool or page, with copy-paste templates, and how to edit the assessment's words (all in `src/assessment/content.ts`).
- **Maintaining the code:** [`CLAUDE.md`](CLAUDE.md): structure, content model, design system and gotchas.

## Run it

Requires Node 22.

```bash
cd portfolio
npm ci
npm run dev             # http://localhost:4321
npm run build           # type-checks, then builds the static site into dist/
npm test                # the assessment's tests: scoring, share links, content
npm run check:reviews   # which frameworks and posts are due for review
npm run drafts          # the assessment's words still marked TODO REVIEW
```

## Deploy on Vercel

This site is its own Vercel project, next to the others in this repository (What Do I Actually Do?, The Confident Machine and Track the Pole). Setting it up takes about two minutes, once:

1. In Vercel, **Add New → Project** and import this repository (`cgeorgeandersen/doit`) again. Importing the same repository a second time is expected: each site is a separate project.
2. Next to **Root Directory**, click **Edit** and choose `portfolio`. Vercel then reads [`vercel.json`](vercel.json) and detects Astro, so leave the build settings as they are. Name the project (for example `george-andersen`) and **Deploy**.
3. **Analytics → Enable** in the new project, then redeploy once. Page views are counted without cookies; the footer says so.
4. **Settings → Domains:** add your domain. Until you also set `url` in `src/config/site.ts`, the site uses the project's production domain for its links, sitemap, feed and share images automatically.

After that, every push to `master` that changes something in `portfolio/` redeploys it. Pushes that only touch the other sites skip this project's build: the `ignoreCommand` in `vercel.json` asks git whether anything in this folder changed.

The GitHub workflow in `.github/workflows/portfolio-ci.yml` runs the tests, checks and builds on every push and pull request that touches `portfolio/`; it doesn't deploy.

## Credits

Fonts: Bricolage Grotesque and Instrument Sans (SIL Open Font License), self-hosted via Fontsource. Designed and built with an AI assistant, directed and edited by George Andersen.
