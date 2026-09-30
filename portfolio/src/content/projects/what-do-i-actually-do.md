---
title: "What Do I Actually Do?"
summary: "A two-minute tool that maps your work week into a one-page blueprint: what to fix, what to automate, where AI helps, and what stays human."
status: live
date: 2026-09-26
liveUrl: "https://mapyourworkflow.com"
cover: ./what-do-i-actually-do.png
coverAlt: "The tool's share image: the headline You can't automate work you can't see, beside a blueprint of workflow steps with the stuck points circled in red."
frameworks: [fix-first-ai-last]
tags: [workflow, interactive, privacy-first, teams]
featured: true
order: 2
---

## The problem

Most people can't say where AI or automation fits in their job, because nobody ever mapped the job. A new tool arrives, the fit isn't clear, and people go on working the old way.

The premise of this tool is simple: **you can't automate work you can't see.**

## What I built

A free tool that takes about two minutes.

- **You tap through your week:** which of 21 common workflows you run, roughly how many hours each takes, and which step drags.
- **Every step goes through the four questions** of Fix First, AI Last and gets one label: fix the process, automate it, AI can help, or keep it human.
- **You get a one-page blueprint** of your workflows with the stuck points circled in red, an estimate of how your hours split across the four labels, a range of time you could get back, and three next steps: one fix for this week, one tool to try this month, and one conversation to have with your team.
- **AI steps come with a starter prompt** you can paste into any assistant.
- **It ends with a shareable image** and a post you can edit into your own words.
- **Team leads can combine everyone's links** into a team view that shows shared stuck points and one fix to make together.

## Design decisions

- **No sign-up, no database, no stored answers.** Answers are packed into the link itself, so sharing a blueprint means sharing a link, and nothing is kept on a server. The same trick makes the team view possible without accounts.
- **The order of the questions is the product.** The first "yes" decides each label, so the cheapest fix always wins. AI is the third question, not the first.
- **Honest numbers.** Estimates come from simple, stated assumptions. Answer bands become hours (under two hours counts as one, ten or more as twelve), and the time-back range assumes you capture 35% to 65% of the best case, because nobody gets the best case everywhere. The method is written out on the page.
- **Two minutes or it doesn't happen.** Every answer is a tap, not a text box. Nobody maps their work if mapping is work.
- **Built to be shared.** Tools tend to stick when a team looks at its work together, so the result is designed to be posted and passed around.

## What I learned

<!-- George: add what you've seen from real use: who has used it, what the team view surfaced, anything you'd change. -->

- **Vocabulary is the interface.** "Workflow" and "automation" mean little to most people. "Chasing," "waiting" and "redoing" mean a lot.
- **A link can be both the data and the permission.** Packing answers into the link settled privacy and sharing in a single decision.
- **A tool teaches a framework better than a slide does.** People remember the label their own step received.
