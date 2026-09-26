# What Do I Actually Do?

A single-file web tool (`index.html`) that turns a vague job title into a blueprint of the work behind it.

1. **Pick workflows.** Choose from 21 common workflows, like "the weekly report" or "running a project". Each one is a chain of steps that's already filled in. A few are pre-picked based on the person's area of work.
2. **Add detail.** For each workflow, say roughly how many hours a week it takes and tap the step where it drags.
3. **Blueprint.** Shows their type (The Glue, The Engine, The Translator or The Navigator), how their time splits across the four labels, each workflow drawn step by step with the stuck step marked, two insights with one thing to try each, a LinkedIn image, post text and a share link.

Everything runs in the browser. No build step, no backend, no tracking.

## Publish on GitHub Pages
Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/docs`.
The site will be at `https://cgeorgeandersen.github.io/doit/`. If you host it anywhere else, update `SHARE_URL` near the top of the script.

## Tuning
All the content lives at the top of the script:
- `TYPES` holds the step types: label, best-case share of time you could get back, typical time weight, and what to try.
- `WORKFLOWS` holds the chains of steps.
- `FUNCS` holds the presets for each area of work.
- `REALISTIC` sets the range for time you could get back (35–65% of the best case).
- `STUCK` is the extra weight on the step someone says drags.
- `insights()` holds the rules for choosing the two insights.
