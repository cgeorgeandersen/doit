"""What changed between two ruleset versions, and between two sets of results. Pure functions."""

from __future__ import annotations

from dataclasses import dataclass

from .models import CLASSIFIED, CampaignProduct, Rule, Ruleset, RunResult

ADDED = "added"
REMOVED = "removed"
CHANGED = "changed"

# A rule's content: everything but its identity, revision and timestamp.
RULE_CONTENT = (
    "field",
    "match_type",
    "pattern",
    "action",
    "value_id",
    "priority",
    "workspace_id",
    "owner",
    "active",
    "note",
)


@dataclass(frozen=True)
class RuleChange:
    rule_key: str
    kind: str                       # added, removed or changed
    before: Rule | None
    after: Rule | None
    fields: tuple[str, ...] = ()    # for a change: which parts of the rule changed


@dataclass(frozen=True)
class LineupChange:
    """One product's share of one campaign's lineup, in one lens (workspace_id None is the network)."""

    campaign_value_id: int
    workspace_id: int | None
    product_value_id: int
    before_share: float | None
    after_share: float | None

    @property
    def kind(self) -> str:
        if self.before_share is None:
            return ADDED
        if self.after_share is None:
            return REMOVED
        return CHANGED


@dataclass(frozen=True)
class VersionDiff:
    from_version: int
    to_version: int
    rules: tuple[RuleChange, ...]
    lineups: tuple[LineupChange, ...]

    @property
    def is_empty(self) -> bool:
        return not self.rules and not self.lineups


def diff_rulesets(before: Ruleset, after: Ruleset) -> VersionDiff:
    """Rules added, removed or changed (matched by rule_key), and lineup shares that moved."""
    old = {rule.rule_key: rule for rule in before.rules}
    new = {rule.rule_key: rule for rule in after.rules}
    rule_changes = []
    for key in sorted(old.keys() | new.keys()):
        a, b = old.get(key), new.get(key)
        if a is None:
            rule_changes.append(RuleChange(key, ADDED, None, b))
        elif b is None:
            rule_changes.append(RuleChange(key, REMOVED, a, None))
        elif a.id != b.id:
            fields = tuple(name for name in RULE_CONTENT if getattr(a, name) != getattr(b, name))
            if fields:
                rule_changes.append(RuleChange(key, CHANGED, a, b, fields))

    old_shares, new_shares = _lineup_shares(before.campaign_products), _lineup_shares(after.campaign_products)
    lineup_changes = [
        LineupChange(*key, old_shares.get(key), new_shares.get(key))
        for key in sorted(old_shares.keys() | new_shares.keys(), key=lambda k: (k[0], k[1] or 0, k[2]))
        if old_shares.get(key) != new_shares.get(key)
    ]
    return VersionDiff(before.version_id, after.version_id, tuple(rule_changes), tuple(lineup_changes))


def _lineup_shares(rows: tuple[CampaignProduct, ...]) -> dict[tuple[int, int | None, int], float]:
    """Each product's share of its lineup. Weights 1:1 and 2:2 are the same lineup."""
    totals: dict[tuple[int, int | None], float] = {}
    for row in rows:
        lineup = (row.campaign_value_id, row.workspace_id)
        totals[lineup] = totals.get(lineup, 0.0) + row.weight
    return {
        (row.campaign_value_id, row.workspace_id, row.product_value_id): round(
            row.weight / totals[(row.campaign_value_id, row.workspace_id)], 9
        )
        for row in rows
    }


# What happened to one outcome between two results.
GAINED = "gained"           # now classified, wasn't before
LOST = "lost"               # was classified, isn't now
REASSIGNED = "reassigned"   # classified both times, to different values or shares
RESTATUSED = "restatused"   # moved between unclassified, conflict and ignored


@dataclass(frozen=True)
class ClassificationChange:
    raw_string_id: int
    dimension: str
    lens: str
    before_status: str | None
    after_status: str | None
    before_allocation: tuple[tuple[int, float], ...]
    after_allocation: tuple[tuple[int, float], ...]

    @property
    def kind(self) -> str:
        if self.before_status == CLASSIFIED and self.after_status == CLASSIFIED:
            return REASSIGNED
        if self.after_status == CLASSIFIED:
            return GAINED
        if self.before_status == CLASSIFIED:
            return LOST
        return RESTATUSED


def compare_results(before: RunResult, after: RunResult) -> list[ClassificationChange]:
    """Every outcome whose status, values or spend shares differ between two results.

    A different rule arriving at the same values with the same shares is not a
    change in the result.
    """
    old = {(c.raw_string_id, c.dimension, c.lens): c for c in before.classifications}
    new = {(c.raw_string_id, c.dimension, c.lens): c for c in after.classifications}
    changes = []
    for key in sorted(old.keys() | new.keys()):
        a, b = old.get(key), new.get(key)
        a_state = (a.status, a.allocation) if a else (None, ())
        b_state = (b.status, b.allocation) if b else (None, ())
        if a_state != b_state:
            changes.append(ClassificationChange(*key, a_state[0], b_state[0], a_state[1], b_state[1]))
    return changes
