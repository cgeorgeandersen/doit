# The Confident Machine

An interactive essay on how to live and work with AI. Its argument: AI is brilliant, fluent and confident, and sometimes wrong in ways you can't see, so the skill that matters is **calibrated trust**: knowing when to rely on it, when to check it, and when to keep a task for yourself.

Readers don't just read about this; they test it on themselves.

| Chapter | What the reader does |
| --- | --- |
| **It Sounds Right** | Picks which of two answers to trust (one is Google Bard's real, wrong launch-demo answer) before learning which is which. |
| **1 · The Prediction Machine** | Watches a word model train in the browser on three Project Gutenberg books, guesses its next word, builds sentences from its odds, and turns up the temperature. |
| **2 · Confidently Wrong** | Answers ten questions with a confidence slider and gets a live calibration curve; then grades a machine and sees why tests that never charge for wrong answers train bluffers. |
| **3 · The Jagged Frontier** | Sorts twelve tasks into "does well" and "struggles", then sees the research, split into over-trust and under-trust. |
| **4 · The Trust Map** | Places twelve tasks on a map of how easy they are to check against how costly a mistake is, then compares with ours. |
| **5 · When Trust Scales** | Trains a hiring screener that never sees group membership and watches a zip code carry old bias forward; makes three decisions about privacy, oversight and accountability. |
| **6 · The Moving Boundary** | Guesses how far AI agents' task length has grown, sees prices fall, follows the EU AI Act's shifting dates, and decides which claims about AI are still true. |
| **What We Keep** | Weighs three futures and the contested evidence, chooses what to keep doing themselves, and leaves with a **My Rules for AI** card (PNG or text). |

Every factual claim links to a primary source. Time-sensitive claims carry a "Checked" date and live in one file, [`src/content/timely.json`](src/content/timely.json), so the essay can be kept current. Design rationale, research decisions and assumptions are in [`DESIGN.md`](DESIGN.md).

It is a static site: no backend, no API keys, no tracking, and no network requests at runtime. Both models are trained in the reader's browser. The reader's answers are kept only in their browser (`localStorage`).

## Run it

Requires Node 22 (the version pinned in `package.json` and used by CI and Vercel).

```bash
cd confident-machine
npm ci
npm run dev        # http://localhost:5173
```

## Test it

```bash
npm test               # Vitest: the engines and the content
npm run typecheck      # TypeScript, strict
npm run check:facts    # lists dated claims not re-checked in the last 120 days
```

The engine tests cover what the essay claims about its own models: next-word probabilities sum to 1 (for seen, rare, unseen and empty contexts, and after any temperature); higher temperature increases entropy; generation is deterministic under a fixed seed; the synthetic hiring screener's impact ratio is below 0.8 with the zip code and clearly better without it (on seven seeds); and the calibration curve and Brier score match hand-computed values.

The content tests check that every citation in the HTML resolves to a source, every `timely.json` entry has a source URL and valid dates, the chart data is well formed, and the interactive content (quiz, frontier tasks, trust-map tasks, dilemmas) is complete and sourced.

## Build and deploy

```bash
npm run build      # typechecks, then writes a static site to confident-machine/dist
npm run preview    # serves the build locally
```

The build uses relative asset paths (`base: './'`), so `dist/` works from any path on any static host.

- **Vercel (the live site):** import the repository; every push to `master` redeploys. Either Root Directory setting works. With the repository root, the root [`vercel.json`](../vercel.json) builds inside `confident-machine/` and copies the output to `dist/`. With Root Directory set to `confident-machine`, [`confident-machine/vercel.json`](vercel.json) runs the standard Vite build. The commands in both files check where they are running, so neither setting can point `npm ci` at the wrong folder.
- **Checks:** the workflow in [`.github/workflows/confident-machine-ci.yml`](../.github/workflows/confident-machine-ci.yml) installs, tests, checks fact freshness and builds on every push and pull request that touches the essay. It does not deploy anywhere. This repository's GitHub Pages site (from the `gh-pages` branch) is a different project and is left alone.
- **Anywhere else:** upload the contents of `dist/` to any static host.

Page weight is about 0.8 MB of HTML, CSS and JavaScript before fonts (about 0.4 MB compressed), with the book text (about 0.8 MB) loaded only when Chapter 1 approaches. Fonts are self-hosted, Latin subsets only.

## Keep the facts current

All time-sensitive content lives in `src/content/timely.json`. Chapter 6 is drawn entirely from it, and other chapters pull individual claims from it. Each entry looks like this:

```json
{
  "id": "agents-osworld",
  "section": "agents",
  "claim": "On OSWorld, a test of AI agents doing real tasks on a computer, success rose from about 12% to 66.3%…",
  "sourceName": "Stanford HAI, AI Index Report 2026",
  "sourceUrl": "https://hai.stanford.edu/ai-index/2026-ai-index-report",
  "asOf": "2026-04-13",
  "lastChecked": "2026-09-27",
  "contested": false
}
```

- `claim` is shown to readers exactly as written. Use typographic quotes (’ “ ”); a test enforces it.
- `asOf` is the date the claim describes (usually the source's publication date). `lastChecked` is when someone last re-read the source.
- `contested: true` adds a "Contested" tag. Use it where careful researchers disagree, and present the disagreement rather than picking a side.
- Some entries carry a `data` block that drives a chart: `metr-horizon.data.series` (time horizons), `price-per-token.data.series` (prices) and `eu-ai-act.data.milestones` (the timeline; a `was` date is shown struck through).
- `halfLife.claims` feeds "The half-life of a fact". Each claim has `statedOn`, `status` (`overtaken`, `revised` or `standing`), `overtakenOn` for the first source that recorded the change, and the update with its source.

To update:

1. Run `npm run check:facts` to see which claims are due (older than `meta.staleAfterDays`, 120 days). Readers see those claims marked "may be out of date".
2. Re-read each source. If the facts changed, rewrite the claim; never keep a number the source no longer supports. Update `asOf`, `sourceUrl` and `sourceName` if you switch to a newer source.
3. Set `lastChecked` to today, and `meta.lastReviewed` to today.
4. Run `npm test` and `npm run build`. The header's build date updates automatically.

Static, non-time-sensitive citations live in [`src/content/sources.ts`](src/content/sources.ts). Cite them in the HTML with `<span data-cite="key"></span>` and cite a dated claim's source with `data-cite="timely:<id>"`; footnotes are numbered per chapter automatically.

## Other scripts

```bash
npm run corpus     # re-download and clean the three Gutenberg books into src/corpus/
npm run fonts      # copy the self-hosted fonts from @fontsource into src/assets/fonts/
```

## Project layout

```
confident-machine/
  index.html          page shell; chapters are included from src/html/ at build time
  src/html/           the prose, one partial per chapter (readable without JavaScript)
  src/engine/         pure, tested logic: n-gram model, sampling, logistic regression,
                      the synthetic hiring world, calibration
  src/chapters/       one module per chapter, mounted as the reader approaches it
  src/components/     charts, polls, case file, navigator, theme toggle, machine text
  src/content/        timely.json, sources.ts, and the quiz, tasks and dilemmas
  src/lib/            DOM helpers, the case-file store, citations, scrollytelling
  tests/              Vitest suites for the engines and the content
  scripts/            corpus preparation, font copying, the fact-freshness check
```

## Credits and licences

Code: MIT. Books: *Alice's Adventures in Wonderland* (Lewis Carroll), *Pride and Prejudice* (Jane Austen) and *The Adventures of Sherlock Holmes* (Arthur Conan Doyle), public domain, via Project Gutenberg. Fonts: Bodoni Moda, Newsreader and IBM Plex Mono, SIL Open Font License (licence files in `src/assets/fonts/`). Chart scales and shapes: D3.

The essay was written and built with the help of an AI assistant, working from a human editor's brief, and its claims were checked against primary sources.
