# doit

This repository holds four websites and an old iOS app.

| Folder | What it is | Live at |
| --- | --- | --- |
| [`portfolio/`](portfolio/) | **George Andersen's portfolio**: frameworks for making AI useful, the projects that prove them, and free tools, including the AI readiness self-assessment **How Boring Is Your AI?** (`/tools/how-boring-is-your-ai`) | [georgeandersen.net](https://www.georgeandersen.net) (Vercel, with Root Directory `portfolio`) |
| [`what-do-i-actually-do/`](what-do-i-actually-do/) | **What Do I Actually Do?** Map your work in two minutes and see what needs a fix, what a tool can take over and what needs you. | Vercel, from the repository root; also [GitHub Pages](https://cgeorgeandersen.github.io/doit/) |
| [`confident-machine/`](confident-machine/) | **The Confident Machine**, an interactive essay on how to live and work with AI | [Vercel](https://doit-t17l.vercel.app), with Root Directory `confident-machine` |
| [`flockwatch/`](flockwatch/) | **Track the Pole**: enter two addresses and see the Flock license plate cameras along the drive, how many would photograph your car, and who answers for each one | [trackthepole.com](https://trackthepole.com) (Vercel, with Root Directory `flockwatch`) |
| `Doit/`, `Doit.xcodeproj/` | A 2019 iOS to-do app | Not deployed |

## What Do I Actually Do?

The whole tool is one self-contained page, [`what-do-i-actually-do/index.html`](what-do-i-actually-do/index.html), plus the image shown in link previews (`og.png`). There is nothing to install or build.

- **Vercel:** a project whose Root Directory is the repository root (the default when you import the repository) serves this folder, as set in the root [`vercel.json`](vercel.json). Setting the Root Directory to `what-do-i-actually-do` works too. Every push to `master` redeploys.
- **Visit counts:** turn on **Analytics** in the Vercel project (Analytics → Enable), then redeploy once. The page loads Vercel's counting script only when it is served from Vercel. It removes the part of a shared link after `#`, which holds that person's answers, before anything is sent, and it shows a note in the footer once counting is on.
- **GitHub Pages** serves a copy of the same files from the `gh-pages` branch, so older links to `cgeorgeandersen.github.io/doit/` keep working. After changing the page here, copy `index.html` and `og.png` to `gh-pages` as well.

## The Confident Machine

See [`confident-machine/README.md`](confident-machine/README.md).

## Track the Pole

See [`flockwatch/README.md`](flockwatch/README.md).

## Portfolio

See [`portfolio/README.md`](portfolio/README.md). To add a project, framework, post or page, see [`portfolio/HOW-TO-ADD-CONTENT.md`](portfolio/HOW-TO-ADD-CONTENT.md).
