# Churn Signal Desk

A single-file web app for triaging customer feedback. Drop in a CSV of comments and it
scores sentiment, groups complaints into trackable patterns, ranks which customers to
contact, and tests whether anything actually changed.

Open `index.html` in a browser. There is no build step, no server and no install. It
opens on a bundled sample dataset so you can see what it does before loading your own.

## Privacy

Everything — parsing, scoring, statistics — runs in your browser. No comment, name or
email address is transmitted anywhere. Disconnect from the network and it works
identically. That is the reason it is built as a single file rather than a service.

## Loading your data

Drag a `.csv`, `.tsv` or `.json` file onto the window, or use **Load your data**.

Columns are detected automatically by name and content — you do not need to rename
anything. The only required column is the comment text; everything else adds capability:

| Role | Detected from headers like | What it unlocks |
|---|---|---|
| **Comment text** *(required)* | `comment`, `feedback`, `review`, `text`, `verbatim` | everything |
| Date | `date`, `created`, `submitted`, `timestamp` | trends, recency weighting, change tests |
| Customer ID | `customer_id`, `account_id`, `id` | grouping comments per customer |
| Name / email / phone | `customer_name`, `email`, `phone` | a contactable outreach list |
| Account value | `mrr`, `arr`, `revenue`, `ltv`, `value` | revenue-at-risk, value weighting |
| Rating | `rating`, `stars`, `csat`, `nps` | rating-vs-text conflict detection |
| Segment / channel | `plan`, `tier`, `segment`, `channel`, `source` | breakdowns and filters |

If no comment column is found the app says so and lists the columns it did see.

## What each tab does

- **Overview** — headline numbers, sentiment trend, and what moved since the prior period.
- **Priority outreach** — customers ranked 0–100, with the factor breakdown behind each
  score and a CSV export of the call list.
- **Patterns** — what people are talking about, whether each pattern is genuinely rising,
  and emerging language no pattern covers yet.
- **Trends** — sentiment over time, plus breakdowns by segment and channel.
- **Comments** — every comment with the word-level contributions that produced its score.
- **How it works** — the full method and its limits. Worth reading before presenting output.

## How it works, briefly

**Sentiment** is [VADER](https://github.com/cjhutto/vaderSentiment) (Hutto & Gilbert,
ICWSM-14), ported faithfully to JavaScript — the full 7,520-entry lexicon plus its
negation, booster, capitalisation, punctuation and contrastive-conjunction rules. The
port is verified against all 15 reference cases from the original test suite and matches
to four decimal places. A lexicon was chosen over a transformer because every score can
be traced to the exact words that caused it, which is what makes an outreach list
defensible.

**Patterns** come from a fixed keyword taxonomy, not clustering. Clusters get renumbered
on every run, so they cannot be tracked across months; fixed categories can. The
*Emerging language* table is the counterweight — it surfaces spiking phrases that no
category covers, which is where new categories should come from.

**Priority** is an additive 0–100 score over six weighted factors, scaled by recency.
Additive so the breakdown always sums to the score and a disagreement is about a weight
rather than about a model. Note that **churn intent outweighs sentiment severity**: in
testing, the two most dangerous comments in the sample data both scored *exactly 0.000*
from VADER — a calm non-renewal warning and a fourth escalation, neither containing an
emotionally-charged word. Anger is loud and cheap; stated intent to leave is quiet and
expensive. The churn detector therefore runs independently of the sentiment scorer.

This score ranks, it does not predict. Calling it a churn probability would require
labelled outcomes to fit against.

**Change detection** compares the most recent quarter of the date range against the
preceding quarter — a two-proportion z-test for pattern share, Welch's t-test for mean
sentiment. p-values are corrected with Benjamini–Hochberg, because testing 13 patterns
at p < 0.05 yields roughly 0.65 false alarms per run uncorrected, and a tool that cries
wolf monthly stops being believed.

## Tuning it for your business

Everything worth changing is a plain data structure near the top of `index.html`:

- `FACTORS` — priority weights. If you churn over billing rather than delivery, edit these.
- `THEMES` — the pattern taxonomy. Add categories the *Emerging language* table surfaces.
- `CHURN` / `ESCAL` — the risk phrase detectors and their weights.
- `DOMAIN` — extra sentiment terms. These only apply where VADER has no entry, so its
  published calibration is never overwritten.
- `BANDS` — the Critical / High / Watch thresholds.

## Files

- `index.html` — the entire application, lexicons and sample data included.
- `sample-comments.csv` — the bundled 368-comment sample, if you want it separately.
