# Dragnet

A police surveillance simulator. You work one shift, 2 to 10 p.m. on a Friday, as an analyst in the Real-Time Crime Center of Port Avery, a made-up city of about 650 people. The console, a made-up product called PANOPTIC, gives you the tools U.S. police use today. Ten cases come in through the shift. They start routine (a stolen car, a burglary) and get worse (a sergeant who wants his estranged wife’s location, an out-of-state sheriff looking for a woman who had an abortion, a deputy chief who wants dirt on the councilmember voting to cancel the camera contract). Every choice is yours, and the shift report at the end tallies whose records you pulled, what your choices caused, and the real cases each one mirrors, with sources.

There’s also **free play**: every tool open, no cases, with a few suggestions to start.

## The tools

| Tool | What it does in the simulation | The real thing it stands for |
| --- | --- | --- |
| **Plate reader search** | 30 cameras read every passing plate. Search by plate (with wildcards), by what the car looks like (color, make, a bumper sticker), or by camera. Frequent locations, “where it sleeps”, convoy analysis, owner lookup. A hotlist alerts live when a listed plate is read, and OCR misreads make false hits. | Flock-style ALPR networks |
| **Phone location data** | Draw a box on the map, pick a window, get every device inside it. Then each device’s trail, where it sleeps (which gives away a home, which gives away a name) and the subscriber behind it. Broker data or a geofence warrant. | Data brokers selling ad-ID location data; Google geofence warrants |
| **Cell-site simulator** | Park the van, switch it on: every phone in range connects. Find the target IMSI and locate it; count the bystanders and dropped calls. | Stingray / Hailstorm IMSI catchers |
| **Face recognition** | Search booking and driver’s license photos with a still from a CCTV camera. A ranked list of candidates with similarity scores, an alibi check, and the tricks analysts have used (“enhance”, pasted-in features, a celebrity lookalike). | Police face recognition on mugshot and DMV galleries |
| **Gunshot detection** | Alerts from rooftop microphones in two neighborhoods, with the recording to play. Dispatch or dismiss; see what it really was. A Bayes’ rule explainer with sliders. | ShotSpotter-style acoustic sensors |
| **Social media monitoring** | A keyword list over public posts, a risk score, account identification and a watchlist pinned to home addresses. | Geofeedia-style monitoring tools |
| **Predictive patrol** | A hot-spot forecast that learns from recorded crime, run a day at a time, with the truth hidden until you ask. Shows the feedback loop and the fix (learn only from resident reports). | PredPol/Geolitica-style forecasts |
| **Dossier** | Everything on one person, fused: home, work, routine by hour, places visited, overnights, associates, posts, sensitive inferences and a threat index. | Fusion-center profiles |
| **Audit log** | Every search with the reason typed. The counter in the top bar is everyone whose records your searches touched. | The search logs ALPR vendors keep |

## How it’s simulated

Everything is generated from one seed, in the browser, in about a third of a second.

- **The city** (`src/core/city.ts`): a 13 × 10 street grid with six neighborhoods, a river with three bridges, ~180 homes and ~50 named places, some of them sensitive (a women’s health clinic, a shelter with a confidential address, an immigration legal aid office, a mosque, a union hall, a psychiatrist). Plate cameras sit at 30 intersections; gunshot sensors cover only Eastside and the Harbor.
- **The people** (`src/core/people.ts`, `src/core/cast.ts`): residents and visitors with homes, jobs and shifts, cars, phones (most with apps that sell location), a 64-number face vector, and weekly habits. Nineteen scripted characters carry the cases.
- **Their days** (`src/core/schedule.ts`): each person’s day is built from hashes of (person, day), so any day can be computed on its own and always comes out the same. Trips follow the street grid; drivers keep their habitual routes.
- **What the systems record** is derived from those days: plate reads where car trips pass cameras (with OCR misreads), location pings while at places and denser ones while moving, gunshot events with overlapping classifier scores, posts from templates.
- **The forecast** (`src/core/forecast.ts`) is a separate small model: equal true crime everywhere, a biased starting history, patrols to the top-scoring blocks, and records that depend on where the patrols were.

The engine in `src/core/` has no DOM code and is covered by tests (`tests/`). The UI (`src/ui/`) draws the map on a canvas every frame and mounts one tool panel at a time. The shift (`src/story/`) is a list of cases, each a thread of messages, objectives met by what you do in the tools, and choices.

## Keeping the facts right

Every real-world claim lives in a case’s lesson (`src/story/cases.ts`) and cites a source in `src/story/sources.ts`. `npm test` checks that every cited source exists and is used. The facts were checked against those sources in October 2026. If something changes (a ruling, a vendor policy), update the sentence and its source together.

## Privacy

The simulation runs entirely in the browser and sends nothing anywhere. On Vercel, the page counts page views with Vercel Web Analytics (no cookies), as the other sites in this repository do.

## Development

Node 22. From this folder:

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest: the city, the cast, every tool's logic, the shift's structure
npm run build      # type-check, then build to dist/
```

In development, `window.__dragnet` exposes the running console (`c.advance(minutes)` moves the clock), which helps when testing a case.

## Deploying

A Vercel project with **Root Directory** `dragnet`. `vercel.json` sets the build and a strict content security policy (everything is served from the site itself). Any static host works for `dist/`.

[`.github/workflows/dragnet-ci.yml`](../.github/workflows/dragnet-ci.yml) installs, tests and builds on every push and pull request that touches this folder. It doesn’t deploy.

## Layout

```
dragnet/
  index.html           page shell
  src/core/            the simulation: city, people, cast, schedules, and each system's logic (no DOM)
  src/story/           the ten cases, the story engine, the shift report, sources
  src/ui/              console shell, canvas map, face and plate renderers, sounds, title screen
  src/ui/tools/        one file per tool panel
  src/styles/          tokens (always dark: it's an operations console), layout, tools, story
  tests/               Vitest suites
```

## Credits

Code: MIT. Fonts: IBM Plex Sans, Sans Condensed and Mono (SIL Open Font License). Dragnet is independent and not affiliated with any police department, vendor or government; PANOPTIC is not a real product. Port Avery and everyone in it are invented.
