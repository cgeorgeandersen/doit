# TagFluent

*Formerly TagFluent. Your marketing source of truth.*

**A shared table for classifying your team's UTMs.** Every UTM in one place. Classify it by typing in a cell, or with a rule like *"if campaign contains cup, then Type is Marketing"*. Add any column your team needs. Every change is saved as a version you can undo.

The problem it solves first: marketing teams have no shared place to classify UTMs, and no easy way to do it. So everyone keeps their own spreadsheet, `fb` and `facebook` and `Summer%20Cup` all mean something slightly different, and reports quietly disagree. TagFluent is master data management (MDM) cut down to that one job.

## How it works

1. **Type in a cell.** Click any cell, type a value and press Enter. It applies to that one UTM.
2. **Write a rule.** If *[campaign] [contains] [cup]* then *[Type]* is *[Marketing]*. One rule fills every matching UTM, including UTMs added later, and shows what it will do before you save it. Conditions combine with **and** (every one matches) or **or** (any one does), and can test whether a part **is blank** or **is not blank**. A rule can also **remove the row**: *if campaign is blank and content is blank, then remove the row* takes those UTMs out of the table, its coverage and its exports. They stay stored, so deleting the rule brings them back.
3. **Add a column.** Region, Agency, Budget owner: anything the team needs to know about a UTM, filled by typing, by rules, or both.

Columns resize like a spreadsheet's: drag a header's right edge, double-click it to reset, or focus it and use the arrow keys. Widths are remembered in your browser and aren't a change to the table, so they don't make versions.

The dashboard at the top shows how much is fully classified (a value in every column) and what's still empty, and the **Needs values** filter lists what's left.

**Who it's for:** data-focused marketers and marketing-focused data people, whoever owns the campaign naming and gets asked why two dashboards disagree.

**Import & export** is where UTMs come in and the classified table goes out. Pasting links or spreadsheet rows, uploading a CSV, downloading the table as CSV and backups all work now. Pulling and deduplicating UTMs from GA4, importing GA4 sessions, and writing to Snowflake, Databricks, BigQuery, Redshift, PostgreSQL or SQL Server are placeholders that show what's coming, including the exact table definition a warehouse would get.

| MDM idea | In TagFluent |
| --- | --- |
| **One record per thing** | One row per UTM. Spellings that differ only in capitals, spaces or URL encoding merge into it, and every spelling is kept. |
| **Consistent values** | Typing "paid social" in a column that already has "Paid Social" uses "Paid Social", so values don't drift. |
| **Rules, not one-off edits** | A rule is one sentence that keeps classifying as new UTMs arrive. "Make it a rule" turns a typed value into one. |
| **Clear precedence** | A typed value beats every rule. Within a column, rules run top to bottom and the first match wins. Each rule shows how many cells it fills, and how many matches a rule above already took. |
| **Versioning** | Every change is a numbered version: who, when, what. Any version can be restored, and a restore is itself a version, so nothing is lost. |

Everything in the demo is fictional: Zestify is a made-up beverage brand, and so are its team and their UTMs.

## Uploading a CSV

One UTM per row, with a header row: `utm_source,utm_medium,utm_campaign,utm_content,utm_term` (or `source`, `medium` and so on; any capitals, any order). Leave out the parts a UTM doesn't use. Other columns are ignored, so TagFluent's own export can come back in; values in classification columns aren't imported yet. Without a header the columns are read in that order. A column of tagged links works too, and commas, semicolons or tabs all separate columns. The Add UTMs panel shows this guide, an example, and a template to download, and previews what an upload will add before anything is saved. The same panel connects Google Analytics 4, so UTMs can come from GA4 without leaving the table.

## Try it

The demo opens two weeks into a team's use: 102 UTMs, three columns (Channel, Campaign, Type), 17 rules, a few typed values, and 41% fully classified. The tip box suggests a first rule: *if campaign contains "cup", then Type is Marketing* fills 15 empty cells and takes the table to 54%. History shows four teammates' changes, including a paste of Fall Kickoff links that the existing rules classified as they arrived.

When you're ready for your own UTMs, **Start with an empty table** (on the Table page while the sample is showing, and under Import & export → Download) clears the sample, history included, so real data never mixes with Zestify's. **Load the sample data** brings it back.

## Run it

Requires Node 22.

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest: the engine, versions, pasting, the demo, export, GA4 parsing
npm run build      # type-check, then build to dist/
```

## On AWS

Hosted on AWS in us-east-2. Visitors see a home page with **Sign in** and **Create an account**; once signed in, their workspace is loaded from and saved to their own account.

| Piece | What it is |
| --- | --- |
| Site | An AWS Amplify app connected to this repository. **Every push to `main` builds, tests and deploys** (`amplify.yml`, headers in `customHttp.yml`) |
| Sign-in | Amazon Cognito user pool `utmdm-users` with Cognito's hosted sign-in pages, authorization code flow with PKCE (`src/cloud/auth.ts`) |
| Data | DynamoDB table `utmdm-workspaces`. Each of a user's tables is one item per version (`sk` = `C#<version>`) plus a `META` item, under `pk` = `USER#<Cognito sub>` for the first table and `USER#<sub>#<table id>` for the others. The list of a user's tables is under `pk` = `TABLES#<sub>`. Point-in-time recovery and deletion protection are on |
| API | API Gateway HTTP API with a Cognito JWT authorizer, in front of the Lambda `utmdm-api` (`infra/api.js`): `GET /workspace` (the table and the list of tables), `POST /workspace/changes` (append; a version that already exists is a 409), `PUT /workspace` (replace, or create a table), `DELETE /workspace`. Each takes `?table=<id>` (default `main`). An account can have up to 25 tables (`MAX_TABLES` in `infra/api.js`); a new one past that is a 403 |

The backend is `infra/template.yaml` (stack `utmdm`). It changes rarely, so it isn't deployed on push: after changing `infra/`, sign in to the AWS CLI (`aws login --profile utmdm`) and run `scripts/deploy-infra.sh <amplify-app-id>`. That also gives the Amplify app the API and sign-in addresses as environment variables, which the build writes into `config.json`. Without them (`npm run dev`, a local build) the app runs on its own with the workspace in the browser.

## Importing from Google Analytics 4

On **Import & export**, **Connect Google Analytics** opens Google's consent pop-up for read-only access (`analytics.readonly`). TagFluent lists the GA4 properties that Google account can read, asks the chosen one for every UTM-tagged session in the date range (`sessionSource`, `sessionMedium`, `sessionCampaignName`, `sessionManualAdContent`, `sessionManualTerm`, with sessions), and previews the result: rows found, the UTMs they make once spellings merge, which are new and which are already in the table, and how many cells the rules fill. **Add** saves them as one version. Sessions without a campaign (direct, organic, referral) aren't UTMs and are left out.

The Google token is held only in the browser tab's memory (about an hour) and never reaches the TagFluent servers; the pop-up hands it back through `ga4-callback.html`.

**Switching it on** needs a Google OAuth client, made once in the Google Cloud console:

1. In a Google Cloud project, enable the **Google Analytics Data API** and the **Google Analytics Admin API**.
2. **Google Auth Platform → Branding**: app name TagFluent, support email. **Audience**: External; while in Testing, add the Google accounts that may use it as test users. **Data access**: add the scope `https://www.googleapis.com/auth/analytics.readonly`. (For anyone outside the test users, Google reviews apps that ask for this scope.)
3. **Clients → Create client → Web application**. Authorized JavaScript origins: the site (e.g. `https://main.<app>.amplifyapp.com`) and `http://localhost:5173`. Authorized redirect URIs: the same with `/ga4-callback.html`.
4. Give the client ID to the Amplify app as the environment variable `UTMDM_GOOGLE_CLIENT_ID` (it isn't a secret). The next build writes it into `config.json`.

## How it's built

A static site: Vite and plain TypeScript, no framework, no server. The engine is pure functions with no DOM, so it can move to a server unchanged.

| Folder | What's in it |
| --- | --- |
| `src/core/` | `model` (the shapes), `normalize`, `rules` (matching and the rule sentence), `table` (applying a change, filling cells, coverage, rule previews), `workspace` (turning what someone did into a saved version), `paste` (links, spreadsheet rows, CSV), `csv` (export), `warehouse` (the table definition a warehouse gets), `store`, `demo` |
| `src/sources/ga4.ts` | The GA4 Data API request and parser, for the refresh that comes later. Not used by the demo yet. |
| `src/ui/` | The four screens: Table (with the column and Add UTMs panels), Rules (the sentence builder with a live preview), Import & export, History |

**Versions are a list of changes.** A workspace stores what was done (add these UTMs, add this rule, type this value), not the table itself. The table at any version is those changes applied in order, the way a bank balance is the sum of its transactions. That's why any version can be rebuilt or restored, and why each change can say exactly who did what.

## What's next (on purpose, not yet)

- **Teams.** Sign-in and per-user storage are live. Next: a workspace shared by a team, with roles for who may add columns or change rules.
- **The GA4 refresh, with sessions.** `src/sources/ga4.ts` already builds the Data API `runReport` request (`sessionSource`, `sessionMedium`, `sessionCampaignName`, `sessionManualAdContent`, `sessionManualTerm`, with sessions and key events) and keeps only UTM-tagged sessions. A Refresh button would add the new UTMs the same way a paste does, and sessions would become a column so the busiest UTMs get classified first. TODO: Google sign-in for an `analytics.readonly` token, the property id, and `https://analyticsdata.googleapis.com` in the Content-Security-Policy.
- **Warehouse destinations.** Write `utmdm.utm_classifications` (see `src/core/warehouse.ts`) to Snowflake, Databricks, BigQuery, Redshift, PostgreSQL or SQL Server on every new version, upserting on `utm_key`, with the rules and the change history alongside.

## Brand, sign-in and demo requests

- **Look:** Ink & Mint. Gloock for display type, Hanken Grotesk for text and Fragment Mono for UTMs, all self-hosted. Aubergine is the action color, mint marks what rules classified, lilac marks what people typed (`src/styles/tokens.css`).
- **Sign-in** happens on TagFluent's own pages (`src/ui/auth-view.ts`): the browser calls Cognito's user pool API directly (`USER_PASSWORD_AUTH` on the public app client), for sign-in, sign-up with an emailed code, and password reset. Sign-out revokes the refresh token.
- **Book a demo** on the home page posts to `POST /demo-request` (no sign-in, throttled to 1 request a second), which validates the form and publishes it to the SNS topic `utmdm-demo-requests`. The topic emails the `DemoEmail` address after that address confirms the subscription once.
- **Accounts need approval.** Anyone can create an account, but when they confirm their email a Cognito post-confirmation trigger (`infra/approve.js`) disables it and emails the owner through the same SNS topic. The person sees "You're on the list" until the owner opens the user in the Cognito console and chooses **Actions → Enable user access**. Cognito doesn't tell them, so the owner lets them know.
- **Branded emails.** Cognito's sign-up, new-code and password-reset emails are written by a custom message trigger (`infra/emails.js`): the TagFluent header with the logo (`public/email/tagfluent-wordmark.png`, a PNG because email apps don't show SVG or web fonts), the code in a large box, and how long it lasts. They still come from Cognito's default sender until the pool is moved to Amazon SES.
- **UTM builder.** A tab after sign-in (`src/ui/views/builder.ts`, logic in `src/core/builder.ts`) that asks ten guided questions and builds a tagged link whose campaign name always follows `time_goal_theme_audience_region`. It shows how the table's rules would classify the link and can add it to the table.
