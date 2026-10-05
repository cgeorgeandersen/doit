# How Boring Is Your AI?

A free, five-minute self-assessment: how ready is a department or a company to get AI into production, and what should it fix first? It's built on the frameworks at [georgeandersen.net](https://www.georgeandersen.net/frameworks) and shares its look. Its stages run from Magic to Boring, and Boring is the goal.

The folder keeps a working name, `ai-readiness/`; it's the Vercel project's Root Directory. The assessment's name is one line in [`src/content.ts`](src/content.ts).

| Screen | What it does |
| --- | --- |
| **First screen** | The idea in one line, a choice of **my department** or **my company**, the four stages and the frameworks behind them. It's written into the page at build time, so it shows before any script runs. |
| **Questions** | 18 questions, three for each of six dimensions, one per screen. Each answer describes something you could see happening, from least to most ready, and scores 0 to 3. Back, Next and a progress bar; the phone's back gesture steps back one question. |
| **Result** | The stage, a scale of all four, points by dimension (a bar chart that doesn't rely on color), the three biggest gaps with the answer given and one next step each, linked to its framework, and a plain statement that it's a self-reported snapshot, not a benchmark. |
| **Keep or share** | A link that holds the answers, print or save as PDF, an optional email form (off until you connect a service, see below), and an invitation to talk on LinkedIn. |

## Edit the words

Every word on the page is in **[`src/content.ts`](src/content.ts)**: the questions and options, the stages, the next steps, the button labels, the consent text and the footer. Change the text between the quotes and save; `npm run dev` shows it at once. The file's opening comment explains the few rules (keep `{placeholders}`, keep four options per question in order from least to most ready).

Every draft I wrote for you is marked `// TODO REVIEW`. To see what's left:

```bash
npm run review     # lists each draft still marked, with its line number
```

Delete a marker once the words under it sound like you. `npm test` then checks the structure and the tone: six dimensions of three questions, four options each, nothing empty, no emoji, no hype words, no agree/disagree scales, and no comparisons with other organizations. Each failure names the question and what to fix.

**Rewording is free; reordering isn't.** A share link stores each answer as its position (0 to 3) in question order. If you add, remove or reorder questions or options, bump `shareVersion` in `content.ts`, so older links show a short notice instead of someone else's answers read wrong.

## How the score works

The rules are in [`src/lib/scoring.ts`](src/lib/scoring.ts) and covered by [`tests/scoring.test.ts`](tests/scoring.test.ts). The page explains them under "How the score works".

1. Each answer scores 0 to 3: its place in the list.
2. A dimension's points are the total of its three answers, out of 9.
3. The stage comes from the average answer across all 18: **Magic** below 0.75, **Alchemy** from 0.75, **Chemistry** from 1.5, **Boring** from 2.25 (`minAverage` on each stage). In points that's 0–13, 14–26, 27–40 and 41–54 overall, or 0–2, 3–4, 5–6 and 7–9 for a dimension.
4. **The weakest link:** the overall stage can sit at most one step above the weakest dimension. Five perfect dimensions and no checking at all is Alchemy, not Boring: one weak link is enough to keep AI from being dependable. Change or turn off the rule with `rules.weakestLinkCap` (a number, or `null`).
5. **Gaps** are the dimensions with points to gain, most in need first: lowest average, then lowest single answer, then the order they're asked in. Each gap quotes its lowest answer and shows that question's next step, with a link to the framework the dimension is built on.

| Dimension | Framework it points to |
| --- | --- |
| Prioritization & risk tiers | Risk-Tiered AI Adoption |
| Workflow readiness | Fix First, AI Last |
| Governance & intake | Risk-Tiered AI Adoption |
| Trust & verification | Calibrated Trust |
| People & judgment | Keep It Human |
| Measurement & value | AI Should Be Boring |

The framework names, symbols and colors in `content.ts` copy the portfolio's. If a framework is renamed there, change it here too.

## Privacy

- **Nothing is stored on a server.** Answers in progress live in the tab's `sessionStorage` and end with the tab. A finished result lives in its link, after the `#`, which browsers never send to a server: `/results#v=1&m=d&a=012301230123012301&t=2026-10-05` (version, d or c for department or company, one digit per answer, the day it was taken).
- **No cookies.** The only stored setting is the light/dark choice, in `localStorage`, as on the portfolio.
- **Visit counts:** Vercel Web Analytics, loaded only in builds on Vercel. [`src/lib/analytics.ts`](src/lib/analytics.ts) cuts every address down to its path plus any `utm_*` or `ref` tag before it's sent, so answers never reach it. The first screen and the questions count as views of `/`, and a finished assessment as a view of `/results`, so the dashboard shows how many people start and finish.
- **Content-Security-Policy** (in [`vercel.json`](vercel.json)): scripts, styles, fonts and requests only from this site. The one inline script, which applies a saved theme before the page paints, is allowed by its hash; if you change [`scripts/theme-init.js`](scripts/theme-init.js), `npm test` prints the new hash to paste in.
- `/results` is kept out of search results (`X-Robots-Tag: noindex`) but stays crawlable, so a shared link still gets its preview on LinkedIn.

## Turn on email

The "Email me this result" form is behind an adapter, so the email service can change without touching the page. [`src/email/index.ts`](src/email/index.ts) picks the adapter, and it's the only line you change.

- **Now:** the stub. It sends nothing. In `npm run dev` it shows the form, logs what it would send in the browser console and reports success, so you can try the flow. In a production build the form doesn't appear, so no visitor sees a promise the page can't keep.
- **To send for real**, point the ready-made `postJsonAdapter` at an endpoint that sends the email:

  ```ts
  // src/email/index.ts
  import { postJsonAdapter, type EmailAdapter } from './adapter.ts';

  export const emailAdapter: EmailAdapter = postJsonAdapter('/api/email-result');
  ```

  It posts JSON: `{ email, wantsNotes, resultUrl, summary: { mode, stage, points, max, gaps, date } }`. `wantsNotes` is true only if they ticked the box, which is never ticked for them.

Two ways to build that endpoint:

**A. A Vercel Function with [Resend](https://resend.com)** (about 30 lines, free tier). Verify a sending domain in Resend, add `RESEND_API_KEY` (and, for the notes list, `RESEND_AUDIENCE_ID`) in the Vercel project's Environment Variables, and add `api/email-result.ts` to this folder:

```ts
// api/email-result.ts: sends a result link, and adds the reader to the notes list if they asked.
const SITE = 'https://howboringisyourai.com'; // this site's address

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    email?: string; wantsNotes?: boolean; resultUrl?: string; summary?: { stage?: string };
  } | null;
  const email = String(body?.email ?? '').trim();
  const link = String(body?.resultUrl ?? '');
  // Only a result link on this site, to one valid-looking address: the endpoint can't send anything else.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !link.startsWith(`${SITE}/results#`)) {
    return new Response('Bad request', { status: 400 });
  }
  const headers = { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: 'George Andersen <results@howboringisyourai.com>',
      to: email,
      subject: `Your AI readiness snapshot: ${body?.summary?.stage ?? 'your result'}`,
      text: `Here's the link to your result. It holds your answers, so keep it to yourself or share it as you like:\n\n${link}\n\nGeorge Andersen\nhttps://www.georgeandersen.net`,
    }),
  });
  if (body?.wantsNotes && process.env.RESEND_AUDIENCE_ID) {
    await fetch(`https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, unsubscribed: false }),
    });
  }
  return new Response(null, { status: sent.ok ? 204 : 502 });
}
```

Vercel serves it at `/api/email-result` alongside the static site. Check Resend's and Vercel's current docs before relying on the details; both change. Add a rate limit in the Vercel project (Firewall → Rate Limiting on `/api/email-result`) so nobody can use the form to send hundreds of emails.

**B. No code:** a Zapier, Make or n8n webhook that sends the email and adds the address to your newsletter tool (Buttondown, Kit…). Use its webhook address in `postJsonAdapter('https://…')`, and add that domain to `connect-src` in `vercel.json`'s Content-Security-Policy (the request is blocked otherwise).

**Either way, before you switch it on:**

- Reread the consent text and the "a few a year" promise in `content.ts` (`email`), and keep them true.
- Change the footer's privacy line (`footer.privacy`): "Your answers stay in your browser" stops being the whole story once someone emails themselves a result.
- For the notes, use double opt-in (most newsletter tools offer it) and include an unsubscribe link in every note.

## Run it

Requires Node 22, as pinned in `package.json` and used by CI and Vercel.

```bash
cd ai-readiness
npm ci
npm run dev        # http://localhost:5173 (the email form shows here, using the stub)
npm test           # Vitest
npm run typecheck  # TypeScript, strict
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve dist/ with the same security headers as Vercel
npm run review     # drafts still marked TODO REVIEW in content.ts
```

The tests cover the scoring rules (each threshold, the weakest-link rule, how gaps are chosen and ordered, ties), share links (round trips, damaged and old links, a damaged date), visit counting (answers never reported), the email adapters, the Content-Security-Policy hash, and the content's structure and tone.

## Deploy on Vercel

This is its own Vercel project, next to the portfolio and the other sites in this repository. Once:

1. In Vercel, **Add New → Project** and import `cgeorgeandersen/doit` again. Importing the same repository a second time is expected: each site is a separate project.
2. Next to **Root Directory**, click **Edit** and choose `ai-readiness`. Vercel reads [`vercel.json`](vercel.json) (Vite, `npm run build`, output `dist`). Name the project and **Deploy**.
3. **Analytics → Enable**, then redeploy once.
4. **Settings → Domains:** add the domain, then set `site.url` in `content.ts` to match. Until then, the canonical link and the share image use the project's production address automatically.
5. In the portfolio, set the project page's `liveUrl` to that address and remove its `draft: true` (`portfolio/src/content/projects/how-boring-is-your-ai.md`).

After that, every push to `master` redeploys it. The workflow in [`.github/workflows/ai-readiness-ci.yml`](../.github/workflows/ai-readiness-ci.yml) tests and builds on every push and pull request that touches this folder; it doesn't deploy.

## Project layout

```
ai-readiness/
  index.html             the page shell; build markers (<!--app:…-->) are filled from content.ts
  vite.config.ts         writes content into index.html, renders the share image, inlines CSS
  vercel.json            build settings, the /results rewrite, security headers
  scripts/               share-image renderer and its fonts, the inline theme script, list-reviews
  src/content.ts         every word on the page
  src/render.ts          the first screen, header and footer as HTML, at build time
  src/app.ts             screens, history and saved progress
  src/lib/               pure, tested logic: model, scoring, share links, analytics, text
  src/ui/                the question and results screens, theme toggle, DOM helpers
  src/email/             the email adapter (stub by default) and the line that picks it
  src/styles/            tokens.css (an unchanged copy of the portfolio's), base, chrome, app
  tests/                 Vitest suites
```

## Credits

Design: the portfolio's "Studio" system, its tokens copied unchanged. Fonts: Bricolage Grotesque and Instrument Sans (SIL Open Font License), self-hosted. Built with an AI assistant, directed and edited by George Andersen.
