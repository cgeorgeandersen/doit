# CONA AI Portal

One page for rolling AI out across the company: training, everyday use, project governance, and proof of value for leadership.

## Sections

- **Home.** Your level (Starter → Practitioner → Regular → Champion), this week's challenge, a 20-second "log a win" form, and company-wide numbers.
- **Learn.** Six five-minute lessons with checks, a 30-minute team session plan, and a cheat sheet. Progress is shared, so adoption shows up by team.
- **Prompts.** 35 tested prompts, plus prompts colleagues share.
- **Projects.** The AI project register. Each project moves through Idea → Assessed → Awaiting approval → Approved → Pilot → Live → Closed and carries its own paperwork: intake and idea check, risk tier (7 questions → Tier 1–3), exec brief with a plain-English check, approval record, pilot plan, oversight and monitoring, privacy and legal sign-off, quarterly benefits tracking, post-launch review and an audit trail. The tier decides which paperwork is required, and stage gates block moving on until it's done. Exports: brief PDF, full governance pack PDF.
- **Value.** Adoption and training by team, hours returned (self-reported, counted at an adjustable %), project benefit approved vs delivered, a wins feed, a quarterly value report PDF, and CSV exports. Admins set headcount, hourly cost, the counting % and the team list here.

## Access (claude.ai Share menu)

- Share with the company as **Contributor**: people can log wins, track their own progress, share prompts and work on projects.
- Give the AI review board **Editor**: only Editors can record approval decisions, change settings, or remove example data.
- Data rules enforce this: `approvals` and `config` are Editor-only, and each person can only write their own `people/<id>` record.

Opened as a plain file outside claude.ai, the portal works the same but stores everything in that browser only.

## Where things live

Content (lessons, questions, challenges, tiers, prompts) is in the first `<script>` blocks, so wording can be changed without touching the logic. The shared data layer is `connect()`, `put()` and `del()`.
