# This repository

Eight independent projects share this repository. Changing one never requires touching another. The six live websites each deploy as their own Vercel project with their own Root Directory; Cherokee Small Jobs is still at the design stage and isn't deployed yet; the Campaign Mapping Layer is a Python app that isn't deployed (Streamlit can't run on Vercel; see its README).

| Folder | What it is | Guide |
| --- | --- | --- |
| `portfolio/` | George Andersen's portfolio site (Astro, static), including the playbook "What boring AI looks like" (`/playbook`; its words are in `portfolio/src/playbook/content.ts`) and the AI readiness self-assessment "How Boring Is Your AI?" (`/tools/how-boring-is-your-ai`; its words are in `portfolio/src/assessment/content.ts`) | [`portfolio/CLAUDE.md`](portfolio/CLAUDE.md), and [`portfolio/HOW-TO-ADD-CONTENT.md`](portfolio/HOW-TO-ADD-CONTENT.md) for adding content |
| `confident-machine/` | The Confident Machine, an interactive essay (Vite, vanilla TypeScript) | [`confident-machine/README.md`](confident-machine/README.md), [`confident-machine/DESIGN.md`](confident-machine/DESIGN.md) |
| `what-do-i-actually-do/` | What Do I Actually Do?, a single-page tool | [`README.md`](README.md) |
| `flockwatch/` | Track the Pole (trackthepole.com; working name FlockWatch), a map of the Flock license plate cameras on any drive or in any town (Vite, vanilla TypeScript, MapLibre) | [`flockwatch/README.md`](flockwatch/README.md) |
| `campaign-mapping/` | Campaign Mapping Layer, a prototype that classifies messy UTM strings with a versioned rule table and reports coverage; synthetic data only (Python, SQLite, Streamlit). The engine in `campaign_mapping/` must never import Streamlit | [`campaign-mapping/README.md`](campaign-mapping/README.md) |
| `utmdm/` | UTMDM, a shared, versioned table for classifying a team's UTMs by typing in cells or with sentence rules, with columns the team adds, and an Import & export page where the GA4 and warehouse connections are still placeholders; runs entirely in the browser (Vite, vanilla TypeScript). Its engine in `src/core/` has no DOM code, and the workspace is a list of changes that `store.ts` saves | [`utmdm/README.md`](utmdm/README.md) |
| `sealed/` | Sealed, a group vote where every ballot stays secret until everyone has voted (Vite, vanilla TypeScript, one Vercel Function in `api/` with Upstash Redis). `src/core/` is shared by browser and server and has no DOM; server-side relative imports end in `.js`; no API response may ever include another person's ballot | [`sealed/README.md`](sealed/README.md) |
| `cherokee-small-jobs/` | Cherokee Small Jobs, a website for a handyman company in Cherokee County, GA. For now it holds four self-contained homepage mockups in `design-options/` while a direction is chosen; the phone, email, hours and reviews in them are placeholders | [`cherokee-small-jobs/README.md`](cherokee-small-jobs/README.md) |
| `Doit/`, `Doit.xcodeproj/` | A 2019 iOS app, not deployed | — |

- The root `vercel.json` serves `what-do-i-actually-do/`. Don't repoint it; the other sites set their Root Directory in Vercel instead.
- Work inside the folder of the project you're changing, and run its own install, checks and build from there.
- CI lives in `.github/workflows/`, one workflow per project, filtered by path. None of them deploy.
