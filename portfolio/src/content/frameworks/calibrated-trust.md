---
title: "Calibrated Trust"
thesis: "Fluency isn't truth. Use AI where checking is cheaper than doing, and trust it exactly as far as it has earned."
question: "How far should we trust it?"
date: 2026-09-29
lastReviewed: 2026-09-29
order: 3
---

## The idea

AI sounds equally sure when it's right and when it's wrong. Its fluency comes from predicting likely words, and nothing in that process checks facts. So the useful question isn't "is AI good?" It's "should I rely on it for *this*?"

Calibrated trust means trusting a tool exactly as far as its track record justifies. Think of a weather forecaster: "70% chance of rain" is well calibrated if it rains on about 70% of those days. The forecaster's tone tells you nothing. The track record does.

**The Trust Map** turns that into a decision with two questions:

- **How easy is it for *you* to check the output?**
- **How bad would a mistake be?**

|  | Easy for you to check | Hard for you to check |
| --- | --- | --- |
| **A mistake is minor** | Delegate freely | Use it for ideas only |
| **A mistake is costly** | Use it, then verify | Keep it human, or add expert review |

The rule underneath: **use AI where checking is cheaper than doing.**

For agents, systems that act rather than answer, add a third question: **can the action be undone?** An answer passes through your judgment before it does anything. An action may not. Anything that sends, pays, deletes or publishes needs a person in the loop or a hard limit.

## Why it works

- **It targets the real failure.** The problem isn't that AI makes mistakes; people do too. It's that AI's mistakes don't look like mistakes. Tying reliance to your ability to check puts a safeguard exactly where fluency misleads.
- **Anyone can apply it in seconds.** "Is checking cheaper than doing?" is an economic test. It doesn't require knowing how the model works.
- **It's personal on purpose.** The same draft is easy for an expert to check and impossible for a novice. The map asks about *you*.
- **It scales to organizations.** The quadrants become policy: which tasks run freely, which need review, and which stay with people.

## Where it breaks down

- **"Easy to check" can be an illusion.** Spot checks miss subtle errors, and people stop checking once a tool seems reliable. Verification has to be designed, not assumed.
- **Novices can't check what they don't know.** The map can push beginners toward "ideas only" for everything. That may be right, but it slows learning, so pair it with training.
- **The map is a snapshot.** Reliability changes by task and by model release. A task that's "ideas only" today may be "use, then verify" next year. Re-map regularly.
- **At scale, individual checking stops working.** When one system makes ten thousand decisions a day, its errors become policy. That calls for monitoring and audits, not only a careful user.
