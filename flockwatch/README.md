# Track the Pole

Live at [trackthepole.com](https://trackthepole.com). (The code keeps its working name, FlockWatch, in this `flockwatch/` folder, which is the Vercel project’s Root Directory.)

Enter two addresses and Track the Pole maps every known Flock license plate camera along the drive, counts the ones that would photograph your car, and tells you who answers for each one (or pick a town to see every camera inside it): the mayor or county, the county commissioners (Georgia so far), state legislators and members of Congress for that spot, with a way to reach each. That last part is what sets it apart from other camera maps, so the page leads with it: the headline, the camera card and the route results all put the officials first. Below the map, a short explainer covers what the cameras record, who can search the data, the legal picture, and what people can do. Every factual claim there links to a source.

| Part | What it does |
| --- | --- |
| **The map** | A heat map of every mapped plate reader when zoomed out, individual cameras with the direction each one faces when zoomed in. |
| **The count** | Routes the drive (with alternatives), finds the cameras that would see the car, and shows the number, how often one comes up, and a numbered list. When there's an alternative route with fewer cameras, it says so. |
| **The camera card** | Hover over (or tap) any camera. Who answers for it comes first: the city, town or county (on unincorporated land) with a button to its council’s website, or, where the county’s commissioners have been collected, one button that emails all of them at once; then the county board (inside a city), its state legislators and members of Congress with email, phone and contact-form buttons. Below that: whether it sees your front or rear plate, which way it faces, and who paid for and runs it when that’s known. Hovering shows a one-line summary of who answers. |
| **Who answers for these cameras** | For a whole route, right under the count: every city or county, every collected county board, and every legislator whose territory holds a counted camera, with camera counts and contact buttons. |
| **Cameras in a town** | Under the route boxes: pick a city or town and the map outlines its legal boundary and shows every mapped plate reader inside it, Flock and others, each one clickable. The count comes with the same “Who answers for these cameras” block, and the town can be shared as `#town=Decatur,+GA`. |
| **Cameras near me** | Zooms the map to the visitor’s location at street level, so cameras can be tapped without typing an address. The location stays in the browser. |
| **The explainer** | What Flock cameras are and record, retention and sharing, the law, what you can do, how we count, data and privacy. |

## Where the data comes from

| Data | Source | When |
| --- | --- | --- |
| Cameras | [DeFlock](https://deflock.me)’s export of OpenStreetMap plate readers (ODbL) | Fetched at build time and served from this site |
| Map | [OpenFreeMap](https://openfreemap.org) vector tiles | From the visitor’s browser |
| Routes | [OSRM](https://project-osrm.org) on [FOSSGIS](https://routing.openstreetmap.de/about.html)’s server, falling back to the OSRM demo server | From the browser, one request per search |
| Address search | [Photon](https://photon.komoot.io) (komoot), U.S. results only | From the browser, as you type |
| City and town suggestions | U.S. Census Bureau [gazetteer of places](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) and [population estimates](https://www.census.gov/programs-surveys/popest.html) | Fetched at build time, one small file per first letter |
| Town boundaries | U.S. Census Bureau [TIGERweb](https://tigerweb.geo.census.gov) (incorporated and Census-designated places) | Through this site’s `/api/boundary`, when someone counts a town |
| Districts for a camera | [U.S. Census Geocoder](https://geocoding.geo.census.gov) | Through this site’s `/api/census` (the Census server doesn’t allow cross-site calls) |
| State legislators | [Open States](https://open.pluralpolicy.com/data/) bulk CSVs | Fetched at build time |
| Members of Congress | [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | Fetched at build time |
| Mayors and county leaders | [Wikidata](https://www.wikidata.org) | From the browser, when a card or summary needs them |
| County commissioners (Georgia) | Each county’s own website, copied by hand into [`src/content/boards/`](src/content/boards/) with the page and date for every county | Committed to the repository; served from this site, one file per state |
| Visit counts | [Vercel Web Analytics](https://vercel.com/docs/analytics) (no cookies) | From the browser to this site, with the route taken out of each address first |

No API keys. Camera data is served from this site rather than queried per visitor because DeFlock’s CDN only allows its own pages to call it, the Overpass API is a shared volunteer resource, and serving it ourselves means a visitor’s route is never sent anywhere.

## How it counts

The rules live in `COUNT_RULES` in [`src/lib/seen.ts`](src/lib/seen.ts) and are explained to readers under “How we count”.

1. Load the 1° camera tiles the route passes through (not its whole bounding box).
2. Consider cameras within 60 m of the route.
3. Read each camera’s `direction` tag ([`src/lib/direction.ts`](src/lib/direction.ts) handles degrees, several directions, field-of-view ranges such as `338-23`, compass words and the noise volunteers leave behind). With no readable direction, a camera counts only if it stands within 30 m of the route.
4. Otherwise it counts when the route passes through its view (±40° of where it points, within 60 m) while traveling within 50° of its line of sight: away from the camera (it sees the rear plate) or toward it (the front). A camera aimed at a side street, a parking lot or the far side of a divided road is shown as “nearby, not counted”.

Counts are minimums: only cameras volunteers have mapped are known.

### Counting a town

[`src/lib/town.ts`](src/lib/town.ts). A town's count is every mapped plate reader inside its boundary, with no direction rule, so it measures something different from a route's count, and the page says so under “How we count”.

1. The town box offers only the Census list of places (`citiesOnly` in [`src/ui/combobox.ts`](src/ui/combobox.ts)), so every pick comes with the Census's own point for it, which always lies inside the place.
2. TIGERweb is asked which incorporated place, then which Census-designated place (an unincorporated community), contains that point. No name matching is needed. The outline comes back simplified to about 10 m (Decatur, GA is 5 KB; Houston, 200 KB).
3. The 1° camera tiles under the outline's bounding box are loaded, and each camera inside the box is tested against the outline: cast a line from the camera and count how many times it crosses the border. An odd count means inside. Holes in a city (an unincorporated pocket) and cities in several pieces need no special case.
4. “Who answers for these cameras” looks up at most 120 cameras, spread from one end of the town to the other, because legislative districts can split a city.

Townships and New England towns that the Census doesn't list as places (it calls them county subdivisions) aren't offered yet.

## The address boxes

[`src/ui/combobox.ts`](src/ui/combobox.ts) suggests places as you type, like a map app. Photon’s free server can take a few seconds to answer, so:

- Cities and towns come up instantly from the Census list (32,000 places, split by first letter so typing “a” loads one file of about 20 KB compressed; the largest, “s”, is 46 KB), ranked by population and leaning toward the other end of the route ([`src/lib/places.ts`](src/lib/places.ts)). “Springfield, IL”, “springfield il” and a half-typed “atlanta, g” all narrow by state.
- Addresses, streets and named places come from Photon. Requests go out while you type (at least every 0.4 s), none is cancelled, and the newest answer to arrive is shown, so the list fills in and sharpens with a “Searching…” row instead of waiting for a pause. Landforms such as “Atlantic Coastal Plain” are dropped, and one place mapped several times appears once.
- An empty box offers “Use my current location”. Enter takes the highlighted suggestion, or the top one.

## Who answers for a camera

[`src/lib/officials.ts`](src/lib/officials.ts): the Census Geocoder gives the city or township, county, and state and congressional districts for the camera’s location. District names are normalized so the Census’s “Third Suffolk District” matches Open States’ “3rd Suffolk”, and DC’s council, Nebraska’s one-house legislature, multi-member districts and counties without governments are handled.

Mayors come from Wikidata, which is often stale after elections. The query prefers people’s own dated “position held” records over the city’s “head of government” field, skips anyone recorded as having left office or died, and only accepts humans (Wikidata once listed a video game character as mayor of New York). On 23 large cities checked in October 2026, including many whose mayors took office in January 2026, it named the current mayor in 21; one city had no data and one still named its former acting mayor. The pinned card links each name to Wikidata so anyone can check or fix it.

## County commissioners

[`src/lib/boards.ts`](src/lib/boards.ts). The county board sets the sheriff’s budget and votes on county camera contracts, and on unincorporated land it is the only local government there is, so the page offers one button that opens an email to the whole board: every member’s address on the To line, and a short draft (a few questions and one ask) that the sender edits before sending. No free list of county commissioners covers the country (Open States stops at state legislatures, Wikidata rarely has more than the chair, and Google’s Civic Information API no longer lists representatives), so each state’s boards are collected from the counties’ own websites.

- **The data.** One file per state, [`src/content/boards/ga.json`](src/content/boards/ga.json), keyed by the county’s five-digit Census code, which the Census Geocoder already returns for every camera. Each county has its board’s name, its members (name, seat, email and phone where published), an address for the whole board if the county gives one, the page everything was copied from, and the date it was checked. The file is loaded only when someone looks up a camera in that state.
- **Who gets the email.** Every member with an address of their own, plus the board’s shared address when anyone lacks one. When a member has neither, the button says so (“Email 4 of the 5 commissioners”) and the card names who it misses. A county that publishes no addresses at all gets its phone number instead.
- **Georgia.** Collected in October 2026, starting with the counties that hold the most mapped Flock cameras. The page’s note under each button links to the county page the addresses came from, so anyone can check them.
- **Keeping it current.** Commissioners change after elections (Georgia’s terms are staggered, so some seats change every two years) and between them. Re-check each county after the November election, in camera-count order, and update `checked`. `npm test` fails if a county lacks a source, a date or a well-formed address.
- **Adding a state.** Add `src/content/boards/<state>.json` in the same shape; nothing else changes.

## Who paid for a camera

[`src/lib/funding.ts`](src/lib/funding.ts) writes the card’s “Funded and operated by” line. The operator comes from OpenStreetMap (recorded for about 1 in 7 Flock cameras), and a few rules read its kind from the name: city, county, state, federal, tribal or private, or nothing when the name doesn’t say. Who paid stays unknown unless `FUNDING` holds a public record for that operator’s Flock cameras (records don’t extend to its other makers’ cameras), or the operator is a business or association, whose own cameras count as privately funded. Running a camera doesn’t mean paying for it: Texas paid for thousands of cameras that city police run.

To add a record, add one entry to `FUNDING`: a pattern for the operator’s name, the source’s link and month, and for a city or county agency a point in that place (a record only applies within 50 km of it, because other states have towns with the same name). `npm test` fails if a record has no source or date.

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

The tests cover the geometry; the direction parser against every format found in the data; the counting rules on synthetic roads (rear and front captures, cameras aimed at cross streets and parallel roads, unknown directions, a corner, a performance check with 40,000 cameras); the officials logic against real Census answers saved in `tests/fixtures/` (cities, a Pennsylvania township, DC, Boston, a newly incorporated city) and against stale-Wikidata cases; every county board in the data (codes, sources, dates, addresses) and who the board email reaches and says; address labels and city matching (ranking, states, accents, alternate names); who-paid labels against real operator names, including look-alikes such as the Falls Church Police Department; the zip reader for the Census file; share links for routes and towns; the inside-the-town test on squares, holes, L shapes and multi-part cities and on Decatur, GA's real Census outline (`tests/fixtures/tiger-decatur-ga.json`); and the page’s content: every citation number must match its source’s place in the list.

## Build and deploy

```bash
npm run build        # typecheck, then write the static site to dist/ (uses whatever is in public/data/)
npm run build:deploy # fetch fresh data, then build: what Vercel runs
npm run preview      # serve dist/ with the same security headers as Vercel, and the Census proxies
```

- **Vercel:** import the repository as a new project and set its Root Directory to `flockwatch`. [`vercel.json`](vercel.json) runs `npm run build:deploy`, so every deploy carries that day’s camera data; it also rewrites `/api/census/*` to the Census Geocoder and `/api/boundary/*` to TIGERweb, and sets the security headers, including a Content-Security-Policy that limits the page to the services listed above. If the data fetch fails, the build fails and the previous deployment stays live.
- **Domain:** in the Vercel project, Settings → Domains, add `trackthepole.com` and `www.trackthepole.com` (redirecting to it), then add the DNS records Vercel shows wherever the domain was bought. HTTPS is automatic. The page’s canonical and sharing links point to trackthepole.com.
- **Fresh data on a schedule:** camera data changes daily. To redeploy regularly without a code change, create a Deploy Hook in the Vercel project (Settings → Git → Deploy Hooks) and call it on a schedule, for example from a scheduled GitHub Action that keeps the hook URL in a repository secret.
- **Visit counts:** Web Analytics is turned on in the Vercel project’s Analytics tab, and [`src/main.ts`](src/main.ts) loads Vercel’s script in production builds (`npm run dev` loads nothing). Vercel’s script reports the page’s full address, and a shared link ends in `#from=…&to=…`, so [`src/lib/analytics.ts`](src/lib/analytics.ts) cuts every address down to its path plus any `utm_*` or `ref` tags before it’s sent. Taps on links that reach an official (marked `data-contact` in [`src/ui/contact.ts`](src/ui/contact.ts)) are sent as a `Contact` event with the kind of link (email, phone or web) and the level of government, never which official or where; that count, not visits, is the measure of whether the page leads people to act. Custom events need a Vercel plan that includes them. Blockers using the EasyPrivacy list (on by default in uBlock Origin) stop the script, so visit counts are minimums too. “Data and privacy” on the page says what’s collected; keep it in step.
- **Checks:** [`.github/workflows/flockwatch-ci.yml`](../.github/workflows/flockwatch-ci.yml) installs, tests and builds on every push and pull request that touches this folder. It doesn’t fetch data or deploy.
- **Elsewhere:** any static host works for `dist/`, but the officials lookup needs `/api/census/` forwarded to `https://geocoding.geo.census.gov/geocoder/geographies/`, and counting a town needs `/api/boundary/` forwarded to `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/`. Without the first, cards say officials couldn’t be looked up and link to USA.gov; without the second, the town box shows an error.

## Keep the facts current

The explainer’s facts are dated and sourced in [`index.html`](index.html) (Sources, at the end of the article). When something changes (Flock’s retention default, the Norfolk appeal, new state laws), update the sentence and its source; `npm test` checks that citation numbers still line up. The example routes in [`src/content/examples.ts`](src/content/examples.ts) were chosen in October 2026 from well-mapped areas.

## Halloween decorations

Through October and on November 1, the page wears cobwebs in two corners and a pumpkin in the logo and favicon, a spider drops down its thread over the map, takes a photo with a flash, and climbs back up (once, when the map first comes on screen), and a ghost peeks onto the map from its left edge and says “boo” for a few seconds. None of it catches a click, a drag or a scroll, so the map works the same under it, and the ghost slips out of sight once a route is on the map. People who ask their device for less motion get a spider that just hangs there and a ghost that doesn’t float. It all lives in [`src/seasonal/halloween/`](src/seasonal/halloween/) and switches itself off on November 2, so nothing has to be done for it to go away. To remove it from the code, delete that folder and `tests/halloween.test.ts`, and take the `startHalloween` import and call out of [`src/main.ts`](src/main.ts). Left in, it comes back each October.

## Project layout

```
flockwatch/
  index.html            page shell and all explainer prose (readable without JavaScript)
  scripts/build-data.ts fetches cameras, legislators, Congress and cities into public/data/
  src/lib/              pure, tested logic: geometry, direction parsing, counting,
                        officials matching, county boards and the email draft, who paid,
                        geocoding, routing, tiles, share links
  src/ui/               map, address boxes, camera card, results panel, theme
  src/app.ts            ties search, routing, counting and the map together
  src/content/          example drives, and county commissioners by state (boards/)
  src/styles/           design tokens (light and dark), layout, explainer
  src/seasonal/         holiday decorations that switch themselves on and off by date
  tests/                Vitest suites and real Census fixtures
```

## Credits and licences

Code: MIT. Camera data © OpenStreetMap contributors (ODbL), compiled by DeFlock. Map tiles: OpenFreeMap, OpenMapTiles, OpenStreetMap. Fonts: Public Sans and IBM Plex Mono (SIL Open Font License). Map rendering: MapLibre GL JS (BSD-3-Clause).

Track the Pole is independent. It isn’t affiliated with Flock Safety, DeFlock or any government. It was built with the help of an AI assistant, and its claims were checked against the sources cited on the page.
