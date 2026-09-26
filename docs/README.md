# What Do I Actually Do?

A single-file web tool (`index.html`) that turns a vague job title into a blueprint of the work behind it.

1. **Tap tasks.** About 40 task types, grouped into 7 workflow stages and pre-picked based on the user's area of work.
2. **Size them.** Choose ≤1h, 2–4h, or 5h+ per week, and flag whether each one drains or energizes.
3. **Gut check.** Six yes/no "process smells".
4. **Blueprint.** Shows a work archetype, a Fix / Automate / AI / Human split, the workflow diagram, the top 3 moves, a fix-first ladder with starter AI prompts, a 1080×1350 LinkedIn image, post text, and a share link.

Everything runs in the browser. No build step, no backend, no tracking.

## Publish on GitHub Pages
Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/docs`.
The site will be at `https://cgeorgeandersen.github.io/doit/`. If you host it anywhere else, update `SHARE_URL` near the top of the script in `index.html`.

## Tuning
All the content lives in plain arrays at the top of the script: `TASKS` (verdict, reclaimable share, move, prompt), `FUNCS` (presets), `SMELLS`, and `ARCH`.
