# All Rise

**A quick courtroom game where you're the judge.** The prosecution makes its case, the defense makes its case, and then the gavel is yours: set them free, fine them, give them community service, probation, any number of years in prison, life, or the death penalty. Some cases come with a creative sentence of their own, like making a man apologize to a goose.

Each case takes 30 to 45 seconds. A docket is six cases: at least two silly ones (a goose taken to a high school reunion, a reply-all that melted a server, a grandmother doing 140 to get to bingo) and at least two with no easy answer (a father who broke into a pharmacy for his daughter's insulin, a widow who granted her dying husband's last request, a whistleblower who saved a bridge and leaked her coworkers' medical records doing it).

## How it plays

1. **Strike the gavel to open court.** The bailiff calls the case and reads the charge.
2. **Hear both sides.** Lines type out with a little babble in each speaker's voice; tap to hurry them along. Sometimes a lawyer objects and you rule on it: **Sustained** or **Overruled** (or press S or O).
3. **Keep order.** Most cases, the gallery erupts at some point. Strike the gavel to quiet it, or Bailiff Dot will do it for you and say so.
4. **Rule.** Pick a sentence, slide it to the amount, and strike the gavel. (Striking it when nobody needs it gets a reaction too.)
5. **Read the paper.** The Daily Docket runs a headline about your ruling, says what legal experts and the gallery thought, and stamps it **Overturned** if the appeals court throws it out.
6. **Get your review.** After six cases you get a title (Solomon With a Gavel, The Iron Gavel, The Velvet Gavel, Overturned Again...) and your record.

The gavel is a real button: tap it, click it, or press G from anywhere.

## How rulings are scored

Every sentence goes on one scale from 0 (set free) to 10 (death). Each kind grows with the log of its amount, so a fine ten times bigger is one step more severe, not ten: $100 is 1, $10,000 is 2, a year in prison is 5, ten years 7, twenty-five years 8, life 9.3.

Each case says two things on that scale (`fair` and `crowd` in `src/core/cases.ts`):

- **Justice** is how close you came to the range legal experts would call proportionate. Inside the range is 100; each step outside it costs 18 points.
- **Approval** is how close you came to what the gallery wanted; each step away costs 14 points.

The hard cases are hard because those two disagree. The gallery wants the vigilante set free; the law doesn't. The gallery wants the reservoir poisoner executed; three doctors disagree about whether he knew what he was doing. There's no right answer, and the game doesn't pretend there is. The scores only say how your ruling compares.

Two pieces of real law are built in. A sentence four or more steps above the fair range is overturned on appeal, and so is the death penalty in any case that isn't among the worst murders (in the US, *Kennedy v. Louisiana* ruled it out for crimes against a person that don't take a life). And when you set a serious defendant free, the paper notes that prosecutors can't appeal an acquittal.

## Run it

Requires Node 22.

```bash
cd all-rise
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest: scoring, docket picking, and checks on every case
npm run build      # type-check, then build to dist/
```

`tests/cases.test.ts` checks that every case fits in 45 seconds at reading speed (using the timings in `src/core/timing.ts`) and that every headline a ruling can reach has been written.

## Deploy it on Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `all-rise`. `vercel.json` sets the framework (Vite), install, build and the security headers.
3. Deploy. There's no server, no database and nothing to configure.

## How it's built

Vite and plain TypeScript, no framework and no runtime dependencies. The characters are drawn in SVG, and every sound (the gavel's knock, the babble, the gallery muttering) is made on the spot with the Web Audio API, so there are no image or audio files. localStorage remembers only whether sound is off and which cases you've seen, so the next docket starts with new ones.

| Folder | What's in it |
| --- | --- |
| `src/core/` | No DOM. `cases.ts` holds every word of every case; `sentence.ts` puts sentences on the scale and scores them; `docket.ts` picks a day's cases and names the judge; `timing.ts` sets how fast lines play. |
| `src/ui/` | `game.ts` runs the courtroom from title to review; `gavel.ts` is the gavel; `portrait.ts` draws the people; `audio.ts` makes the sounds. |
| `src/styles/` | `tokens.css` for colors and fonts, `app.css` for everything else. |
| `tests/` | Vitest, for `src/core/`. |

## Adding a case

Add an entry to `CASES` in `src/core/cases.ts`. Keep it to about five lines of under 150 characters, set `fair` and `crowd` on the 0 to 10 scale described at the top of that file, and write a headline for each way the ruling can land. `npm test` says if the case runs long or a headline is missing.
