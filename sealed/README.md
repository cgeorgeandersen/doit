# Sealed

**A group vote where every ballot stays secret until everyone has voted.** Make a list, send the link, and everyone votes on their own phone. No one sees anyone else's vote, and the result opens by itself when the last vote is in.

It started as a movie-night ritual: pick five movies, watch the trailers, rate each one in secret, add up the ratings, so no one sways anyone else. It works for anything a group has to pick: where to eat, which weekend, which name.

## How it works

1. **Make a poll.** Say what you're deciding, list the choices (each can have a link: a trailer, a menu), choose how people vote, and list who's voting, yourself included.
2. **Send the link.** Each person taps their name and votes. The first device to pick a name keeps it, so no one else can vote as you. Anyone with the link can add their name until the votes open.
3. **Wait.** Everyone can see who has voted, never what. You can change your vote until the end.
4. **The last vote opens them all.** Only the combined result is shown. The host can open the votes early if someone can't make it.

| How people vote | How it's counted |
| --- | --- |
| **Rate each one** (1 to 5 or 1 to 10) | Each choice's ratings are added up; the highest total wins. Everyone rates every choice, so the total and the average put the choices in the same order. |
| **Pick one** | One vote per person; the most votes wins. |
| **Rank them** | A Borda count: with 5 choices, first place on a ballot is worth 5 points and last place 1. A choice everyone ranks second can beat one half the group loves and half ranks last. Ballots start in a random order, so the order the host typed doesn't nudge anyone. |

Ties are reported as ties, never broken by list order.

**What everyone sees at the end** is the host's call: the ranking with scores, the ranking without scores, or just the winner. With two or three people, totals can give votes away (you know your own ratings, so you can subtract them from the totals), so hiding the scores is there for that.

**The host** gets a host link (the key is after `#`, so it never reaches the server or the logs). With it they can open the votes early, take someone off the list (their vote goes with them), or free up a name picked on the wrong device. Freeing a name also clears that person's vote, so whoever picks the name next can't read it.

## What's secret, exactly

- The page and the API never show anyone's ballot, except your own back to you so you can change it. Results are counted only once the poll is closed. `tests/server.test.ts` checks that no rating appears in anything anyone can fetch before then.
- Ballots are stored in Redis, one hash field per person. **Whoever runs the database can read them.** It's secret from the other voters, not from the site owner.
- There are no accounts. A device proves who it is with a random token (the server stores only its SHA-256), saved in that browser.
- Polls are deleted 60 days after their last change.

## Run it

Requires Node 22.

```bash
cd sealed
npm ci
npm run dev        # http://localhost:5173, with the API; polls live in memory
npm test           # Vitest: counting, checks, and whole polls against both stores
npm run build      # type-check, then build to dist/
```

`npm run dev` serves `/api/poll` from `vite.config.ts` with the same handler Vercel runs, so nothing else is needed. Polls are forgotten when it restarts, unless `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set.

## Deploy it on Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `sealed`. `vercel.json` sets the framework (Vite), install, build, the `/p/<id>` rewrite and the security headers. `api/poll.ts` becomes the function at `/api/poll`.
3. **Connect a database:** in the project, **Storage → Create Database → Upstash for Redis** (the free plan is plenty), and connect it to the project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an Upstash console work too.)
4. Redeploy. Until a database is connected the site loads, and creating a poll says that voting isn't set up yet.
5. Optional: turn on **Analytics** for page views (no cookies). Every poll is counted as `/p/[id]`, so no poll's link reaches the analytics.

## How it's built

Vite and plain TypeScript, no framework. One Vercel Function and Upstash Redis over its REST API with plain `fetch`, so the only runtime dependency is Vercel Analytics.

| Folder | What's in it |
| --- | --- |
| `src/core/` | Shared by the browser and the server, no DOM: `model` (the shapes, limits, and the checks for a new poll and a ballot) and `tally` (counting, ties, and what each "show" setting keeps) |
| `src/server/` | `polls` (create, join, claim a name, vote, open, remove, free up), `handler` (the HTTP endpoint), `store` (the five Redis commands it uses, plus an in-memory copy), `redis` (Upstash REST) |
| `api/poll.ts` | The Vercel Function: `handle` with the Redis store |
| `src/ui/` | `home` (making a poll), `poll` (picking your name, the ballot, waiting, results, host controls), `saved` (what this browser remembers: host key and who you are, never a ballot), `api` |

**One write per person.** Each ballot, name and device token is its own field in a Redis hash, written on its own. Two people sealing their votes at the same moment can't overwrite each other, which a single "poll" document read, changed and written back could. Closing uses `SET NX`, so the first close sticks.

**Server-side imports end in `.js`** (`'../core/model.js'`) even though the files are `.ts`. Vercel compiles each function file to ES modules one by one without bundling, and Node needs the real extension; TypeScript and Vite map `.js` back to `.ts`.

## What's next (on purpose, not yet)

- **Rate limiting** on creating polls and joining. Today anyone can create polls; the 60-day expiry bounds what's stored.
- **Live updates** without polling. Open pages check every 4 seconds while visible, which is fine for a living room of phones.
- **Sign-in**, if it's ever used beyond friend groups. A name plus a device token is the right weight for movie night, not for anything with stakes.
