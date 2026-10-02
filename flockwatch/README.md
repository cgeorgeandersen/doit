# Track the Pole

Live at [trackthepole.com](https://trackthepole.com). (The code keeps its working name, FlockWatch, in this `flockwatch/` folder, which is the Vercel project’s Root Directory.)

Enter two addresses and Track the Pole maps every known Flock license plate camera along the drive, counts the ones that would photograph your car, and tells you who answers for each one: the mayor or county, state legislators and members of Congress for that spot. Below the map, a short explainer covers what the cameras record, who can search the data, the legal picture, and what people can do. Every factual claim there links to a source.

| Part | What it does |
| --- | --- |
| **The map** | A heat map of every mapped plate reader when zoomed out, individual cameras with the direction each one faces when zoomed in. |
| **The count** | Routes the drive (with alternatives), finds the cameras that would see the car, and shows the number, how often one comes up, and a numbered list. When there's an alternative route with fewer cameras, it says so. |
| **The camera card** | Hover over (or tap) any camera: maker, operator if known, which way it faces, whether it sees your front or rear plate, and who answers for it, with email, phone and contact links when pinned. |
| **Who’s responsible** | For a whole route: every city or county and every legislator whose territory holds a counted camera, with camera counts. |
| **The explainer** | What Flock cameras are and record, retention and sharing, the law, what you can do, how we count, data and privacy. |

## Where the data comes from

| Data | Source | When |
| --- | --- | --- |
| Cameras | [DeFlock](https://deflock.me)’s export of OpenStreetMap plate readers (ODbL) | Fetched at build time and served from this site |
| Map | [OpenFreeMap](https://openfreemap.org) vector tiles | From the visitor’s browser |
| Routes | [OSRM](https://project-osrm.org) on [FOSSGIS](https://routing.openstreetmap.de/about.html)’s server, falling back to the OSRM demo server | From the browser, one request per search |
| Address search | [Photon](https://photon.komoot.io) (komoot), U.S. results only | From the browser, as you type |
| City and town suggestions | U.S. Census Bureau [gazetteer of places](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) and [population estimates](https://www.census.gov/programs-surveys/popest.html) | Fetched at build time, one small file per first letter |
| Districts for a camera | [U.S. Census Geocoder](https://geocoding.geo.census.gov) | Through this site’s `/api/census` (the Census server doesn’t allow cross-site calls) |
| State legislators | [Open States](https://open.pluralpolicy.com/data/) bulk CSVs | Fetched at build time |
| Members of Congress | [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | Fetched at build time |
| Mayors and county leaders | [Wikidata](https://www.wikidata.org) | From the browser, when a card or summary needs them |

No API keys. Camera data is served from this site rather than queried per visitor because DeFlock’s CDN only allows its own pages to call it, the Overpass API is a shared volunteer resource, and serving it ourselves means a visitor’s route is never sent anywhere.

## How it counts

The rules live in `COUNT_RULES` in [`src/lib/seen.ts`](src/lib/seen.ts) and are explained to readers under “How we count”.

1. Load the 1° camera tiles the route passes through (not its whole bounding box).
2. Consider cameras within 60 m of the route.
3. Read each camera’s `direction` tag ([`src/lib/direction.ts`](src/lib/direction.ts) handles degrees, several directions, field-of-view ranges such as `338-23`, compass words and the noise volunteers leave behind). With no readable direction, a camera counts only if it stands within 30 m of the route.
4. Otherwise it counts when the route passes through its view (±40° of where it points, within 60 m) while traveling within 50° of its line of sight: away from the camera (it sees the rear plate) or toward it (the front). A camera aimed at a side street, a parking lot or the far side of a divided road is shown as “nearby, not counted”.

Counts are minimums: only cameras volunteers have mapped are known.

## The address boxes

[`src/ui/combobox.ts`](src/ui/combobox.ts) suggests places as you type, like a map app. Photon’s free server can take a few seconds to answer, so:

- Cities and towns come up instantly from the Census list (32,000 places, split by first letter so typing “a” loads one file of about 20 KB compressed; the largest, “s”, is 46 KB), ranked by population and leaning toward the other end of the route ([`src/lib/places.ts`](src/lib/places.ts)). “Springfield, IL”, “springfield il” and a half-typed “atlanta, g” all narrow by state.
- Addresses, streets and named places come from Photon. Requests go out while you type (at least every 0.4 s), none is cancelled, and the newest answer to arrive is shown, so the list fills in and sharpens with a “Searching…” row instead of waiting for a pause. Landforms such as “Atlantic Coastal Plain” are dropped, and one place mapped several times appears once.
- An empty box offers “Use my current location”. Enter takes the highlighted suggestion, or the top one.

## Who answers for a camera

[`src/lib/officials.ts`](src/lib/officials.ts): the Census Geocoder gives the city or township, county, and state and congressional districts for the camera’s location. District names are normalized so the Census’s “Third Suffolk District” matches Open States’ “3rd Suffolk”, and DC’s council, Nebraska’s one-house legislature, multi-member districts and counties without governments are handled.

Mayors come from Wikidata, which is often stale after elections. The query prefers people’s own dated “position held” records over the city’s “head of government” field, skips anyone recorded as having left office or died, and only accepts humans (Wikidata once listed a video game character as mayor of New York). On 23 large cities checked in October 2026, including many whose mayors took office in January 2026, it named the current mayor in 21; one city had no data and one still named its former acting mayor. The pinned card links each name to Wikidata so anyone can check or fix it.

## Run it

Requires Node 22 (as pinned in `package.json`, and used by CI and Vercel).

```bash
cd flockwatch
npm ci
npm run data       # fetch cameras, officials and cities into public/data/ (about 14 MB, about 10 seconds)
npm run dev        # http://localhost:5173
```

`npm run data -- --only=cameras`, `--only=officials` or `--only=places` refreshes one part.

## Test it

```bash
npm test           # Vitest
npm run typecheck  # TypeScript, strict
```

The tests cover the geometry; the direction parser against every format found in the data; the counting rules on synthetic roads (rear and front captures, cameras aimed at cross streets and parallel roads, unknown directions, a corner, a performance check with 40,000 cameras); the officials logic against real Census answers saved in `tests/fixtures/` (cities, a Pennsylvania township, DC, Boston, a newly incorporated city) and against stale-Wikidata cases; address labels and city matching (ranking, states, accents, alternate names); the zip reader for the Census file; share links; and the page’s content: every citation number must match its source’s place in the list.

## Build and deploy

```bash
npm run build        # typecheck, then write the static site to dist/ (uses whatever is in public/data/)
npm run build:deploy # fetch fresh data, then build: what Vercel runs
npm run preview      # serve dist/ with the same security headers as Vercel, and the Census proxy
```

- **Vercel:** import the repository as a new project and set its Root Directory to `flockwatch`. [`vercel.json`](vercel.json) runs `npm run build:deploy`, so every deploy carries that day’s camera data; it also rewrites `/api/census/*` to the Census Geocoder and sets the security headers, including a Content-Security-Policy that limits the page to the services listed above. If the data fetch fails, the build fails and the previous deployment stays live.
- **Domain:** in the Vercel project, Settings → Domains, add `trackthepole.com` and `www.trackthepole.com` (redirecting to it), then add the DNS records Vercel shows wherever the domain was bought. HTTPS is automatic. The page’s canonical and sharing links point to trackthepole.com.
- **Fresh data on a schedule:** camera data changes daily. To redeploy regularly without a code change, create a Deploy Hook in the Vercel project (Settings → Git → Deploy Hooks) and call it on a schedule, for example from a scheduled GitHub Action that keeps the hook URL in a repository secret.
- **Checks:** [`.github/workflows/flockwatch-ci.yml`](../.github/workflows/flockwatch-ci.yml) installs, tests and builds on every push and pull request that touches this folder. It doesn’t fetch data or deploy.
- **Elsewhere:** any static host works for `dist/`, but the officials lookup needs `/api/census/` forwarded to `https://geocoding.geo.census.gov/geocoder/geographies/`. Without it, cards say officials couldn’t be looked up and link to USA.gov.

## Keep the facts current

The explainer’s facts are dated and sourced in [`index.html`](index.html) (Sources, at the end of the article). When something changes (Flock’s retention default, the Norfolk appeal, new state laws), update the sentence and its source; `npm test` checks that citation numbers still line up. The example routes in [`src/content/examples.ts`](src/content/examples.ts) were chosen in October 2026 from well-mapped areas.

## Project layout

```
flockwatch/
  index.html            page shell and all explainer prose (readable without JavaScript)
  scripts/build-data.ts fetches cameras, legislators, Congress and cities into public/data/
  src/lib/              pure, tested logic: geometry, direction parsing, counting,
                        officials matching, geocoding, routing, tiles, share links
  src/ui/               map, address boxes, camera card, results panel, theme
  src/app.ts            ties search, routing, counting and the map together
  src/styles/           design tokens (light and dark), layout, explainer
  tests/                Vitest suites and real Census fixtures
```

## Credits and licences

Code: MIT. Camera data © OpenStreetMap contributors (ODbL), compiled by DeFlock. Map tiles: OpenFreeMap, OpenMapTiles, OpenStreetMap. Fonts: Public Sans and IBM Plex Mono (SIL Open Font License). Map rendering: MapLibre GL JS (BSD-3-Clause).

Track the Pole is independent. It isn’t affiliated with Flock Safety, DeFlock or any government. It was built with the help of an AI assistant, and its claims were checked against the sources cited on the page.
