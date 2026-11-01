# Cherokee Small Jobs

The website for Cherokee Small Jobs, a handyman company in Cherokee County, Georgia. It's an Astro static site with one Vercel Function, which emails estimate requests to the business.

The look is a small-town shop front: a red-and-white awning, a round badge logo, black "service menu" boards and an estimate form styled as a paper job ticket. This was option 3 of the four design directions; the other mockups are in this folder's git history.

## Pages

| Address | What's there |
| --- | --- |
| `/` | Headline, the service menu, "Got a list?", how it works, the towns served, reviews (once there are any) and the job ticket form |
| `/services` | All 12 services with their common jobs, and the jobs that get referred to a licensed specialist |
| `/services/<slug>` | One page per service, e.g. `/services/drywall-repair`: common jobs, notes, and a button that opens the job ticket with that service ticked |
| `/service-area` | A sketch map of the county along I-575 and the list of towns |
| `/estimate` | The job ticket, contact details and a short FAQ |

On phones, a bar fixed to the bottom of the screen offers Call, Text and Estimate on every page.

## Before launch

Placeholders that have to be replaced:

- [ ] **Phone number, email and hours** in `src/config/site.ts`. The phone number `(770) 555-0142` is made up, and the build prints a warning until it changes.
- [ ] **Estimate emails**: set up Resend and the environment variables (see below). Until then, the form tells visitors to call or text instead.
- [ ] **The site's address**: set `url` in `src/config/site.ts` once the domain is connected.

Worth reading through:

- [ ] **The towns.** The site assumes Cherokee County, **Georgia** (Canton, Woodstock, Holly Springs and so on).
- [ ] **The promises**: "Free estimates", "Upfront prices" and "We clean up" appear in several places. Keep only ones the business will stand behind (`promises` in `src/config/site.ts`, and the wording in the pages).
- [ ] **The jobs referred out** (`referOut` in `src/config/site.ts`), and the notes on the plumbing and electrical pages. Check what Georgia's licensing rules allow without a contractor, plumbing or electrical license, and adjust.
- [ ] **The service descriptions** in `src/content/services.ts`, so they match the work the business actually does.

Later:

- **Reviews**: add real ones to `reviews` in `src/config/site.ts`. The Reviews section stays hidden until there's at least one, so the site never shows made-up praise.
- **An About section** with the owner's name, photo and story. Local customers like knowing who's coming to the house.

## Changing the words

| To change | Edit |
| --- | --- |
| Phone, email, hours, towns, promises, reviews, menu links | `src/config/site.ts` |
| A service's name, menu line, jobs, notes or form label; adding or removing a service | `src/content/services.ts` |
| Page headlines and section copy | `src/pages/*.astro` and `src/components/*.astro` |
| Colors and fonts | the tokens at the top of `src/styles/global.css` |

A service's `slug` is its page address. Changing it breaks old links to that page.

## Estimate form

The job ticket posts JSON to `/api/estimate`. That's `api/estimate.ts`, a Vercel Function; its logic is in `src/server/estimate.ts`. It checks the ticket (name, a 10-digit phone number, town, and at least one type of work or a description) and emails it through [Resend](https://resend.com). A hidden "company" field catches bots: when it's filled in, the function replies as if it worked and sends nothing.

To switch it on:

1. Make a free Resend account and create an API key.
2. In the Vercel project, under **Settings → Environment Variables**, add:
   - `RESEND_API_KEY`: the key.
   - `ESTIMATE_TO`: where tickets go. Separate several addresses with commas.
   - `ESTIMATE_FROM` (optional): the sender, e.g. `Cherokee Small Jobs <tickets@yourdomain.com>`. That needs the domain verified in Resend first. Without it, emails come from Resend's test sender, which can only deliver to the address the Resend account signed up with. That's fine when the owner made the account.
3. Redeploy.

Each email lists the customer's details, the types of work ticked and the description. Replying goes to the customer when they gave an email. Photos aren't uploaded through the form; the page asks people to text them instead.

## Deploying

Import the repository into Vercel as a new project with **Root Directory** `cherokee-small-jobs`. `vercel.json` sets the rest: framework "Other" (so Vercel builds the `api/` function alongside the static pages), `npm run build`, output in `dist/`, clean URLs (`/services` serves `services.html`), and security and caching headers. Deploys are skipped when a push doesn't touch this folder.

## Working on it

```sh
npm install
npm run dev      # the site at http://localhost:4321 (the form's API isn't served here; `vercel dev` runs both)
npm test         # the estimate API's tests
npm run build    # type-check, then build to dist/
```

Fonts (Alfa Slab One and Libre Franklin) are self-hosted from npm packages, so pages load nothing from other sites. `public/og.png` is the image link previews show, and `public/favicon.svg` and `public/apple-touch-icon.png` are the icons.
