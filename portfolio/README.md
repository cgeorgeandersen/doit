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

1. In Vercel, **Add New → Project**, import this repository, and set **Root Directory** to `portfolio`. Vercel reads [`vercel.json`](vercel.json) and detects Astro. Deploy.
2. **Analytics → Enable** in the project, then redeploy once. Page views are counted without cookies; the footer says so.
3. **Settings → Domains:** add your domain. Until you also set `url` in `src/config/site.ts`, the site uses the project's production domain for its links, sitemap, feed and share images automatically.
4. Optional: in **Settings → Git**, turn on skipping deployments when nothing in the root directory changed, so edits to the other sites in this repository don't rebuild this one.

Every push to `master` redeploys. The GitHub workflow in `.github/workflows/portfolio-ci.yml` checks and builds on every push and pull request that touches `portfolio/`; it doesn't deploy.

## Credits

Fonts: Bricolage Grotesque and Instrument Sans (SIL Open Font License), self-hosted via Fontsource. Designed and built with an AI assistant, directed and edited by George Andersen.
