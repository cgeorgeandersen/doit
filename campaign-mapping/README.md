# Campaign Mapping Layer

A prototype that takes the messy UTM strings independent operators already send (`fb` vs `facebook` vs `FB_Paid`, `sc26` vs `summer-cup-26`), classifies them with a managed rule table, and reports how much of the data, and how much of the spend, the rules cover. Think of it as a chart of accounts for marketing campaigns, built after the fact from the mess people already have.

Every name in it is fictional: **Zestify** is an invented beverage brand, and its five operators (Northgate Beverage, Pinecrest Bottling, Harborline Distributing, Sunvale Drinks, Redrock Beverage) are invented bottlers. All data is synthetic.

**Status:** Stage 1 of 4 (data model and engine) is built. Not deployed yet; see [Deploying](#deploying-later).

## Success criteria

Defined before building, so the prototype can fail them.

| # | Criterion | How it is measured |
| --- | --- | --- |
| 1 | **Spend-weighted coverage above 90% after 30 minutes in the review queue** | Share of spend whose campaign is classified in the network lens, from the starter ruleset (built to land at roughly 60–70%) to the ruleset after one review session. "30 minutes" is taken as 40 review decisions at about 45 seconds each; the evaluation replays the queue top-down and reports coverage after each decision. Also reported per operator, and for type, product and objective. |
| 2 | **Zero silent conflicts** | When rules tie at the winning priority and disagree, the outcome is `conflict`: no value is assigned and every competing rule is stored for review. Unit tests cover it, `audit_result()` re-checks every run before it is stored (a run that breaks the promise is refused), and the conflict count is on the coverage report. |
| 3 | **Any past run is exactly reproducible from its ruleset version** | `reproduce_run()` re-classifies the run's input (every raw string up to its watermark) with its ruleset version and compares a SHA-256 fingerprint of the complete results with the one stored at the time. |
| 4 | **Measured precision and recall against ground truth, compared to a naive baseline** | Precision, recall and F1 per campaign (and for type), plus spend-weighted coverage, for three classifiers: the naive keyword filter (`contains "summer cup"`), the starter ruleset, and the ruleset after review. Ground truth is generated separately and never loaded into the app. |

## How it works

1. **Raw strings** are imported as they are and never changed. Each row has an operator, the five UTM fields, a date and its spend.
2. **Rules are data.** A rule says: on this dimension, if this field matches this pattern, assign this controlled value, at this priority. Rules live in a table, not in code.
3. **Every change to the rules is a new ruleset version**, and every classification run records the version it used. Last quarter's numbers can be rebuilt exactly, even after the rules have moved on.
4. **Coverage and the review queue** show what the rules don't explain yet, ranked by spend. Fixing a row means writing or accepting a rule, so the decision persists for every future import.

## Run it

Requires Python 3.11 or newer.

```bash
cd campaign-mapping
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest
```

Stage 3 adds the app (`streamlit run app/Home.py`).

## Layout

```
campaign-mapping/
├── campaign_mapping/      the package; nothing in it imports Streamlit
│   ├── schema.sql         the whole data model, with the triggers that guard it
│   ├── normalize.py       case and whitespace normalization         ┐
│   ├── matching.py        the four match types                      │ pure: no database
│   ├── models.py          the data passed in and out of the engine  │ or files, so they
│   ├── engine.py          classify, explain, preview, audit         │ can sit behind an
│   ├── diff.py            diff two rulesets, or two sets of results ┘ API later
│   ├── db.py              connection, schema, transactions
│   ├── taxonomy.py        operators, dimensions, values, campaigns
│   ├── rulesets.py        versioned rule changes, load or diff any version, revert
│   ├── runs.py            import raw strings, run and store, reproduce a run
│   └── seed.py            the fictional Zestify network
└── tests/
```

`tests/test_architecture.py` fails if any module imports Streamlit, or if a pure module imports the database layer, so the engine stays reusable.

## Data model

```
 TAXONOMY (controlled vocabulary)               INPUTS (append-only)
 workspaces ──────────────┐                     import_batches 1──* raw_strings
   (one per operator)     │                                           │ *
 dimensions 1──* dimension_values 1──1 campaigns          workspace ──┘
   campaign · product ·       │          (dates, operator)
   objective · type           │               │
                              │               │
 RULESET (immutable rows; a version is a manifest of exact rows)
 rules ── value_id ───────────┘               │
   rule_key + revision, dimension, field,     │
   match_type, pattern, action, priority,     │
   workspace (operator scope), owner, active  │
 campaign_products ── campaign_id ────────────┘
   the bridge: campaign → products, weighted, per lens
 ruleset_versions 1──* ruleset_version_rules *──1 rules
                  1──* ruleset_version_campaign_products *──1 campaign_products

 RESULTS (derived: rebuildable from version + watermark)
 classification_runs        version, engine version, input watermark, fingerprints
   1──* classifications     one per string × dimension × lens: status, method
          1──* classification_hits   value, the rule (or lineup row) that fired, spend share
```

| Table | What it holds |
| --- | --- |
| `raw_strings` | One row per imported row, exactly as it arrived: operator, the five UTM fields, date, spend, sends, and a hash for spotting duplicates. |
| `dimensions` | The four seeded dimensions. `layer` is `network` (a shared fact; only network rules may set it) or `workspace` (operators may add their own rules, seen only in their lens). `multi_valued` lets product hold several values. |
| `dimension_values` | The controlled values each dimension allows. Anyone can add one; none is ever renamed or deleted. |
| `campaigns` | Facts about a campaign value: start and end dates, and the operator for a local campaign (blank for network-wide ones). |
| `campaign_products` | The bridge from a campaign to the products its spend goes to, with relative weights. A blank operator is the network lineup; an operator's own lineup replaces it in that operator's lens. |
| `rules` | One immutable revision of a rule. `rule_key` ties a rule's revisions together; `id` is the exact revision a classification says fired. |
| `ruleset_versions` + manifests | A version and the exact rule revisions and lineup rows it contains, with its parent, author and message. |
| `classification_runs` | A run's ruleset version, engine version, input watermark and fingerprints. |
| `classifications` + `classification_hits` | One outcome per string, dimension and lens (`classified`, `conflict`, `unclassified` or `ignored`), and the rules behind it. The view `v_classifications` joins them back into "raw string, dimension, value, fired rule, version". |

## How a string is classified

For each string, dimension and lens:

1. **Normalize.** The string and every pattern go through the same function: Unicode compatibility form, zero-width characters removed, URL-encoded spaces (`%20`, `+`) turned into spaces, lowercase, runs of whitespace collapsed, ends trimmed. Separators like `-` and `_` are left alone on purpose; treating `summer-cup` and `summer_cup` as one string is a classification decision, and decisions belong in rules where they can be seen and versioned.
2. **Match.** Each active rule the lens can see tests the field it names (`source`, `medium`, `campaign`, `content`, `term`, or `any` for all five joined with ` | `) with its match type: `contains`, `exact`, `starts_with`, or `regex` (a search anywhere in the text, case-insensitive; anchor with `^` and `$` to match whole values). Regex patterns are compiled as written, never lowercased, since lowercasing would turn `\D` (not a digit) into `\d` (a digit). A regex that would match anything is rejected as a catch-all.
3. **Precedence.** The lowest priority number among the matching rules wins. If the winning tier disagrees, with two different values on a single-valued dimension or an ignore against an assign, the outcome is a **conflict**: nothing is assigned and every side is kept for review. Rules that tie on the same value are not a conflict; the value stands and every one of those rules is recorded. On a multi-valued dimension (product), every value in the winning tier is assigned.
4. **Default.** If nothing matches, the outcome is **unclassified**. There is no fallback value. Explicit values such as `Non-campaign` or `Not applicable` exist for when a rule knows a string has no campaign; that is a decision, which is different from not knowing.
5. **Product lineups.** When no product rule matches, the string inherits its campaign's lineup from `campaign_products`, split by weight. The operator's own lineup, if it has one, applies in its lens.

**Lenses.** The network lens sees only network rules and lineups; it is what every network roll-up uses. An operator's lens adds that operator's own product rules and lineups and never affects another operator or the network.

**Spend shares.** Each fired hit carries a share of the string's spend (weights add up to 1 per outcome), so a roll-up by product never counts a multi-product string twice.

**Priority conventions.** 10 for exact overrides from the review queue, 50 for specific patterns, 100 (the default) for general patterns, 200 for broad ones.

**Versions.** A rule is never edited in place: an edit writes a new revision and a new version that points to it. Grouped changes (`change_ruleset()`) become one version; a change that changes nothing makes none; a revert is a new version whose contents match an old one. A run stores its version, the engine version and an input watermark, the highest raw string id it read. Raw strings are append-only, so "every id up to the watermark" names the same rows forever, and re-running the version over them must reproduce the stored fingerprint.

## Stages

1. **Data model and engine** (done): schema, engine, versioning, diffs, reproducibility, tests.
2. **Synthetic data generator** (`scripts/generate_data.py`): about 5,000 spend-weighted rows across the five operators, each with its own habits; a separate ground truth file; seeded and deterministic. Also the starter ruleset.
3. **Streamlit app**: Import, Rules, Coverage, Review queue, Versions, Export.
4. **Evaluation**: precision, recall and F1 per campaign against ground truth, spend-weighted coverage, and the naive baseline, with the results written up here.

## Not built yet (on purpose)

- **Auth and roles.** "Admin" is a flag on `create_dimension()`, not a login. TODO: real users, roles, and approval before a rule change goes live.
- **Connectors.** No GA4, BigQuery or ad-platform imports; strings come in from CSV or Excel. TODO: a GA4/BigQuery import that writes to `raw_strings` through the same `import_rows()` path.
- **An API.** The engine is pure Python for this reason. TODO: a small HTTP API over `classify()`, `preview_rule()` and `explain()`.
- **Date-aware rules.** Campaigns have dates, but rules don't use them yet. TODO: flag strings classified to a campaign outside its dates.
- **Branching versions.** History is a straight line; a revert is a new version.
- **Migrations.** Schema changes recreate the database during the prototype.

## Deploying (later)

Streamlit can't run on Vercel: Vercel serves short-lived functions, while a Streamlit app is a long-running server holding a WebSocket per browser, and Vercel doesn't keep a SQLite file between requests. The plan is Streamlit Community Cloud (free; deploys from this repository with `campaign-mapping` as the app folder) for the live app, rebuilding its demo database on start, and a page on the portfolio linking to it. Later, the pure engine can move behind an API on Vercel with a hosted database.
