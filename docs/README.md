# What Do I Actually Do?

**You can't automate work you can't see.** People don't adopt automation or AI because they can't see their own workflows, or where a tool would fit into them. This page gets someone from a vague job title to a map of their work in about two minutes.

## How it works

1. **Your role.** Job title (optional) and area of work.
2. **Your workflows.** Pick from 21 common workflows. A few are pre-picked for the chosen area.
3. **Where it drags.** For each workflow, one tap for hours a week and one tap on the step that drags.

## What people get

- **A blueprint** of their workflows, step by step. Each step gets one of four labels (Fix the process, Automate it, AI can help, Keep it human), and the stuck steps are circled in red. Tapping any step explains why it got its label, what to try, and a starter prompt for AI steps.
- **Their type** (The Glue, The Engine, The Translator or The Navigator) next to their job title.
- **Two insights**: where their work drags, and how much of it really suits AI.
- **Three next steps**:
  - this week, fix one thing with no new tools;
  - this month, try one tool, with a message to send IT or a prompt to paste;
  - at their next 1:1, share the map and ask one question.
- **Sharing**:
  - a 1080×1350 LinkedIn image;
  - post text they can edit;
  - a link that rebuilds their blueprint;
  - Save as PDF.

## Team view

A team lead sends the ready-made message, collects everyone's blueprint links and pastes them in. They see:

- the team's time split across the four labels;
- where the team gets stuck, and how many people say so;
- the workflows people share;
- three team next steps;
- a summary to copy for leadership.

Nothing is stored on a server. Each person's answers live in their own link.

## Publish on GitHub Pages

1. Merge this branch into `main`.
2. Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/docs`.
3. The site will be at `https://cgeorgeandersen.github.io/doit/`.

`og.png` is the link-preview image LinkedIn shows when the URL is pasted. If you host the site somewhere else, update `SHARE_URL` near the top of the script, and the `og:url` / `og:image` tags in the page head.

## Tuning

Everything is plain data at the top of the script in `index.html`:

- `TYPES` holds the step types: label, best-case time you could get back, typical time weight, icon, tip and prompt.
- `WORKFLOWS` holds the workflows and their steps.
- `FUNCS` holds the presets for each area.
- `ARCH` holds the four types.
- `ASK_TEAM` holds the team questions.
- `REALISTIC` is the 35–65% range applied to time you could get back.
- `STUCK` is the extra weight on the step someone says drags.

The rules for the insights and next steps live in `insightDrag()`, `insightFit()` and `makePlan()`.

Icons are from [Lucide](https://lucide.dev) (ISC license), embedded in the page.
