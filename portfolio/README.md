# George Andersen: portfolio

Frameworks for making AI useful, and the live projects that prove them. A static site built with [Astro](https://astro.build): no backend, no database, no CMS, no cookies.

- **Adding content:** [`HOW-TO-ADD-CONTENT.md`](HOW-TO-ADD-CONTENT.md): one Markdown file per project, framework, post or page, with copy-paste templates.
- **Maintaining the code:** [`CLAUDE.md`](CLAUDE.md): structure, content model, design system and gotchas.

## Run it

Requires Node 22.

```bash
cd portfolio
npm ci
npm run dev             # http://localhost:4321
npm run build           # type-checks, then builds the static site into dist/
npm run check:reviews   # which frameworks and posts are due for review
```

## Deploy on Vercel

This site is its own Vercel project, next to the two others in this repository (What Do I Actually Do? and The Confident Machine). Setting it up takes about two minutes, once:

1. In Vercel, **Add New → Project** and import this repository (`cgeorgeandersen/doit`) again. Importing the same repository a second time is expected: each site is a separate project.
2. Next to **Root Directory**, click **Edit** and choose `portfolio`. Vercel then reads [`vercel.json`](vercel.json) and detects Astro, so leave the build settings as they are. Name the project (for example `george-andersen`) and **Deploy**.
3. **Analytics → Enable** in the new project, then redeploy once. Page views are counted without cookies; the footer says so.
4. **Settings → Domains:** add your domain. Until you also set `url` in `src/config/site.ts`, the site uses the project's production domain for its links, sitemap, feed and share images automatically.

After that, every push to `master` that changes something in `portfolio/` redeploys it. Pushes that only touch the other sites skip this project's build: the `ignoreCommand` in `vercel.json` asks git whether anything in this folder changed.

The GitHub workflow in `.github/workflows/portfolio-ci.yml` checks and builds on every push and pull request that touches `portfolio/`; it doesn't deploy.

## Credits

Fonts: Bricolage Grotesque and Instrument Sans (SIL Open Font License), self-hosted via Fontsource. Designed and built with an AI assistant, directed and edited by George Andersen.
