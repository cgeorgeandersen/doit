# UTMDM

**A shared table for classifying your team's UTMs.** Every UTM in one place. Classify it by typing in a cell, or with a rule like *"if campaign contains cup, then Type is Marketing"*. Add any column your team needs. Every change is saved as a version you can undo.

The problem it solves first: marketing teams have no shared place to classify UTMs, and no easy way to do it. So everyone keeps their own spreadsheet, `fb` and `facebook` and `Summer%20Cup` all mean something slightly different, and reports quietly disagree. UTMDM is master data management (MDM) cut down to that one job.

## How it works

1. **Type in a cell.** Click any cell, type a value and press Enter. It applies to that one UTM.
2. **Write a rule.** If *[campaign] [contains] [cup]* then *[Type]* is *[Marketing]*. One rule fills every matching UTM, including UTMs added later, and shows what it will do before you save it.
3. **Add a column.** Region, Agency, Budget owner: anything the team needs to know about a UTM, filled by typing, by rules, or both.

The dashboard at the top shows how much is fully classified (a value in every column) and what's still empty, and the **Needs values** filter lists what's left.

**Who it's for:** data-focused marketers and marketing-focused data people, whoever owns the campaign naming and gets asked why two dashboards disagree.

**Import & export** is where UTMs come in and the classified table goes out. Pasting links or spreadsheet rows, uploading a CSV, downloading the table as CSV and backups all work now. Pulling and deduplicating UTMs from GA4, importing GA4 sessions, and writing to Snowflake, Databricks, BigQuery, Redshift, PostgreSQL or SQL Server are placeholders that show what's coming, including the exact table definition a warehouse would get.

| MDM idea | In UTMDM |
| --- | --- |
| **One record per thing** | One row per UTM. Spellings that differ only in capitals, spaces or URL encoding merge into it, and every spelling is kept. |
| **Consistent values** | Typing "paid social" in a column that already has "Paid Social" uses "Paid Social", so values don't drift. |
| **Rules, not one-off edits** | A rule is one sentence that keeps classifying as new UTMs arrive. "Make it a rule" turns a typed value into one. |
| **Clear precedence** | A typed value beats every rule. Within a column, rules run top to bottom and the first match wins. Each rule shows how many cells it fills, and how many matches a rule above already took. |
| **Versioning** | Every change is a numbered version: who, when, what. Any version can be restored, and a restore is itself a version, so nothing is lost. |

Everything in the demo is fictional: Zestify is a made-up beverage brand, and so are its team and their UTMs.

## Try it

The demo opens two weeks into a team's use: 102 UTMs, three columns (Channel, Campaign, Type), 17 rules, a few typed values, and 41% fully classified. The tip box suggests a first rule: *if campaign contains "cup", then Type is Marketing* fills 15 empty cells and takes the table to 54%. History shows four teammates' changes, including a paste of Fall Kickoff links that the existing rules classified as they arrived.

## Run it

Requires Node 22.

```bash
cd utmdm
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest: the engine, versions, pasting, the demo, export, GA4 parsing
npm run build      # type-check, then build to dist/
```

## Deploy it on Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `utmdm`. `vercel.json` sets the framework (Vite), install, build and the security headers.
3. Deploy. Optional: turn on **Analytics** for page views (no cookies; workspace data never leaves the browser).

## How it's built

A static site: Vite and plain TypeScript, no framework, no server. The engine is pure functions with no DOM, so it can move to a server unchanged.

| Folder | What's in it |
| --- | --- |
| `src/core/` | `model` (the shapes), `normalize`, `rules` (matching and the rule sentence), `table` (applying a change, filling cells, coverage, rule previews), `workspace` (turning what someone did into a saved version), `paste` (links, spreadsheet rows, CSV), `csv` (export), `warehouse` (the table definition a warehouse gets), `store`, `demo` |
| `src/sources/ga4.ts` | The GA4 Data API request and parser, for the refresh that comes later. Not used by the demo yet. |
| `src/ui/` | The four screens: Table (with the column and Add UTMs panels), Rules (the sentence builder with a live preview), Import & export, History |

**Versions are a list of changes.** A workspace stores what was done (add these UTMs, add this rule, type this value), not the table itself. The table at any version is those changes applied in order, the way a bank balance is the sum of its transactions. That's why any version can be rebuilt or restored, and why each change can say exactly who did what.

## What's next (on purpose, not yet)

- **Sign-in and a shared database.** Today the workspace lives in this browser (`localStorage`), with backup and restore on the History page. `src/core/store.ts` is the seam: a hosted database (Postgres, for example Neon through Vercel) implements the same `load` and `save` behind sign-in, and the list of changes becomes a `changes` table, one row per version. TODO: pick the auth provider; one workspace per team.
- **The GA4 refresh, with sessions.** `src/sources/ga4.ts` already builds the Data API `runReport` request (`sessionSource`, `sessionMedium`, `sessionCampaignName`, `sessionManualAdContent`, `sessionManualTerm`, with sessions and key events) and keeps only UTM-tagged sessions. A Refresh button would add the new UTMs the same way a paste does, and sessions would become a column so the busiest UTMs get classified first. TODO: Google sign-in for an `analytics.readonly` token, the property id, and `https://analyticsdata.googleapis.com` in the Content-Security-Policy.
- **Warehouse destinations.** Write `utmdm.utm_classifications` (see `src/core/warehouse.ts`) to Snowflake, Databricks, BigQuery, Redshift, PostgreSQL or SQL Server on every new version, upserting on `utm_key`, with the rules and the change history alongside.
- **Roles.** Who may add columns or change rules, once there's more than one person.
