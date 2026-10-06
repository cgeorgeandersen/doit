# This repository

Four independent projects share this repository. Each deploys as its own Vercel project with its own Root Directory; changing one never requires touching another.

| Folder | What it is | Guide |
| --- | --- | --- |
| `portfolio/` | George Andersen's portfolio site (Astro, static), including the playbook "What boring AI looks like" (`/playbook`; its words are in `portfolio/src/playbook/content.ts`) and the AI readiness self-assessment "How Boring Is Your AI?" (`/tools/how-boring-is-your-ai`; its words are in `portfolio/src/assessment/content.ts`) | [`portfolio/CLAUDE.md`](portfolio/CLAUDE.md), and [`portfolio/HOW-TO-ADD-CONTENT.md`](portfolio/HOW-TO-ADD-CONTENT.md) for adding content |
| `confident-machine/` | The Confident Machine, an interactive essay (Vite, vanilla TypeScript) | [`confident-machine/README.md`](confident-machine/README.md), [`confident-machine/DESIGN.md`](confident-machine/DESIGN.md) |
| `what-do-i-actually-do/` | What Do I Actually Do?, a single-page tool | [`README.md`](README.md) |
| `flockwatch/` | Track the Pole (trackthepole.com; working name FlockWatch), a map of the Flock license plate cameras on any drive (Vite, vanilla TypeScript, MapLibre) | [`flockwatch/README.md`](flockwatch/README.md) |
| `Doit/`, `Doit.xcodeproj/` | A 2019 iOS app, not deployed | — |

- The root `vercel.json` serves `what-do-i-actually-do/`. Don't repoint it; the other sites set their Root Directory in Vercel instead.
- Work inside the folder of the project you're changing, and run its own install, checks and build from there.
- CI lives in `.github/workflows/`, one workflow per project, filtered by path. None of them deploy.
