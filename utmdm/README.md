# UTMDM

**UTM master data for marketers.** One permanent table of every UTM your team has ever used, each one classified with values from a controlled list, every rule change saved as a version, and a clear count of what's still outstanding.

UTMs are where marketing data goes wrong first: everyone types their own (`fb`, `FB`, `facebook`, `fb_paid`; `summer_cup`, `SC26_Promo`, `Summer%20Cup`), nobody owns the list, and reports quietly disagree. UTMDM is master data management (MDM) cut down to what a marketing team needs:

| MDM idea | In UTMDM |
| --- | --- |
| **Golden record** | One row per UTM. Spellings that differ only in capitals, spaces or URL encoding merge into it, and every spelling is kept. |
| **Controlled vocabulary** | Classifications (Channel, Campaign, Type) take values from a list, so "Paid Social" can't drift into "paid-social". Adding a value is easy; values are never renamed or deleted. |
| **Rules, not edits** | A rule says: when this UTM part matches this pattern, this classification gets this value. Classifying one UTM writes a rule, so the decision also covers every future UTM like it. |
| **Survivorship** | When rules disagree, the lowest priority number wins. A tie that disagrees is a *conflict*: no value, both sides shown. Nothing is guessed, and nothing falls into a default like "marketing". |
| **Versioning** | Every rule change is a numbered version holding a full copy of the rules and the coverage it reached. Any version can be compared or restored. |
| **Stewardship** | The dashboard and table rank what's outstanding by traffic, with suggestions, so the most important decisions come first. |

Everything is fictional: Zestify is a made-up beverage brand, and its UTMs are generated.

## Try it

The demo opens with January to April 2026 loaded and the starter rules: 147 UTMs, 71% fully classified, one conflict. Press **Refresh from GA4** to pull the next month. May brings 62 new Summer Cup UTMs, none of them classified, and coverage drops to 50%. Open one, accept the suggestion, and watch the rule cover every UTM like it. **History** charts coverage over time: refreshes bring new mess in, rules bring coverage back up.

## Run it

Requires Node 22.

```bash
cd utmdm
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest: the engine, versions, sample data, GA4 parsing, export
npm run build      # type-check, then build to dist/
```

## Deploy it on Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `utmdm`. `vercel.json` sets the framework (Vite), install, build and the security headers.
3. Deploy. Optional: turn on **Analytics** for page views (no cookies; workspace data never leaves the browser).

## How it's built

A static site: Vite and plain TypeScript, no framework, no server. It's all in the browser, so the demo costs nothing to host and every visitor gets their own private workspace.

| Folder | What's in it |
| --- | --- |
| `src/core/` | The engine, with no DOM: `normalize` (case, spaces, URL encoding), `match` (contains, is, starts with, regex; catch-all patterns refused), `classify` (precedence and conflicts), `workspace` (refreshes, rules, versions; every change returns a new workspace), `suggest` (fuzzy matching plus initials: `sr` spells **S**pring **R**efresh), `csv`, `store` |
| `src/sources/` | Where UTMs come from: `sample` (the demo's seeded months of Zestify data) and `ga4` (the real GA4 Data API request and parser, ready except for sign-in) |
| `src/ui/` | The four screens: Dashboard, UTM table (with the classify panel), Rules (with a live "test this rule"), History |

The engine is the same design as the Python prototype in [`../campaign-mapping/`](../campaign-mapping/), simplified: no operator lenses or product lineups, and versions as full copies of the rules.

## What's next (on purpose, not yet)

- **Sign-in and a database.** Today the workspace lives in the browser (`localStorage`), with backup and restore on the History page. `src/core/store.ts` is the seam: a hosted database (Postgres, for example Neon through Vercel) implements the same `load` and `save`, behind sign-in. TODO: pick the auth provider; move workspaces server-side with one per team.
- **The real GA4 refresh.** `src/sources/ga4.ts` already builds the Data API `runReport` request (`sessionSource`, `sessionMedium`, `sessionCampaignName`, `sessionManualAdContent`, `sessionManualTerm`, with sessions and key events), keeps only UTM-tagged sessions, and returns the same rows the sample does. TODO: a Google sign-in for an `analytics.readonly` token, a field for the GA4 property id, and `https://analyticsdata.googleapis.com` in the Content-Security-Policy.
- **Spend.** GA4 has no cost data, so coverage is weighted by sessions. Ad-platform costs could join later.
- **Custom classifications.** The three fields are fixed for now; adding a field should be an admin action once there are roles.
