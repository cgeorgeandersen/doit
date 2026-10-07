"""The classification engine: a pure function from (raw strings, ruleset) to results.

No database, files or Streamlit in here. Everything it needs arrives as plain
data (models.py) and everything it decides leaves as plain data, so the same
code can run under the Streamlit app now and behind an API later.

For each string, dimension and lens:

1. Candidates are the active rules for that dimension the lens can see. The
   network lens sees network rules; an operator's lens also sees that
   operator's own rules (only on workspace-layer dimensions, such as product).
2. Each candidate tests its pattern against the normalized field it names.
3. The lowest priority number among the matches wins. If that winning tier
   disagrees (two values on a single-valued dimension, or an ignore against an
   assign), the outcome is a conflict: nothing is assigned and every side is
   kept for review. A tie is never broken silently.
4. If nothing matches, the outcome is unclassified. There is no fallback value.
5. Product only: when no product rule matches, the string inherits its
   campaign's product lineup (campaign_products). In an operator's lens, that
   operator's own lineup for the campaign, if it has one, replaces the network's.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import NamedTuple

from .matching import compile_pattern
from .models import (
    ASSIGN,
    BY_LINEUP,
    BY_RULE,
    CANDIDATE,
    CLASSIFIED,
    CONFLICT,
    FIRED,
    IGNORE,
    IGNORED,
    NETWORK,
    UNCLASSIFIED,
    WORKSPACE,
    CampaignProduct,
    Classification,
    Dimension,
    Hit,
    Rule,
    Ruleset,
    RunResult,
    UtmRecord,
    sort_hits,
)
from .normalize import NormalizedUtm

# Bump whenever a change to the engine, normalization or matching could change
# a result. Runs record it, so a run made by older engine logic is never
# mistaken for one that should reproduce exactly.
ENGINE_VERSION = "1"

CAMPAIGN = "campaign"
PRODUCT = "product"

# explain() roles for rules that matched without deciding anything.
SHADOWED = "shadowed"   # outranked by a lower priority number
INACTIVE = "inactive"


class _Outcome(NamedTuple):
    dimension: str
    lens: str
    status: str
    method: str | None
    hits: tuple[Hit, ...]


@dataclass(frozen=True)
class _Candidate:
    rule: Rule
    matches: Callable[[str], bool]


class _Compiled:
    """A ruleset with its patterns compiled and its rules and lineups grouped by lens."""

    def __init__(self, ruleset: Ruleset) -> None:
        self.dimensions = tuple(sorted(ruleset.dimensions, key=lambda d: (d.sort_order, d.key)))
        layers = {d.key: d.layer for d in self.dimensions}
        self._network: dict[str, list[_Candidate]] = {d.key: [] for d in self.dimensions}
        self._operator: dict[tuple[str, int], list[_Candidate]] = {}
        for rule in ruleset.rules:
            _check_scope(rule, layers)
            if not rule.active:
                continue
            candidate = _Candidate(rule, compile_pattern(rule.match_type, rule.pattern))
            if rule.workspace_id is None:
                self._network[rule.dimension].append(candidate)
            else:
                self._operator.setdefault((rule.dimension, rule.workspace_id), []).append(candidate)
        self._lens: dict[tuple[str, int], list[_Candidate]] = {}
        lineups: dict[tuple[int, int | None], list[CampaignProduct]] = {}
        for row in ruleset.campaign_products:
            lineups.setdefault((row.campaign_value_id, row.workspace_id), []).append(row)
        self._lineups = {key: tuple(sorted(rows, key=lambda r: r.id)) for key, rows in lineups.items()}

    def candidates(self, dimension: str, workspace_id: int | None) -> list[_Candidate]:
        """The active rules a lens can see: the network's, plus the operator's own."""
        if workspace_id is None:
            return self._network[dimension]
        key = (dimension, workspace_id)
        if key not in self._lens:
            self._lens[key] = self._network[dimension] + self._operator.get(key, [])
        return self._lens[key]

    def lineup(self, campaign_value_id: int, workspace_id: int | None) -> tuple[CampaignProduct, ...]:
        """A campaign's product lineup in a lens: the operator's own if it has one, else the network's."""
        if workspace_id is not None:
            own = self._lineups.get((campaign_value_id, workspace_id))
            if own:
                return own
        return self._lineups.get((campaign_value_id, None), ())


def _check_scope(rule: Rule, layers: dict[str, str]) -> None:
    layer = layers.get(rule.dimension)
    if layer is None:
        raise ValueError(f"Rule {rule.rule_key} is for {rule.dimension!r}, which is not a dimension")
    if rule.workspace_id is not None and layer != WORKSPACE:
        raise ValueError(
            f"Rule {rule.rule_key} is scoped to one operator, but {rule.dimension} is a shared network dimension"
        )


def classify(records: Iterable[UtmRecord], ruleset: Ruleset) -> RunResult:
    """Classify every record on every dimension: in the network lens, and also in the
    record's own operator lens on dimensions where operators may keep their own rules."""
    compiled = _Compiled(ruleset)
    # Rules only ever see normalized text and the operator, so strings that
    # normalize alike from the same operator are decided once.
    decided: dict[tuple[NormalizedUtm, int], tuple[_Outcome, ...]] = {}
    seen: set[int] = set()
    classifications: list[Classification] = []
    for record in sorted(records, key=lambda r: r.id):
        if record.id in seen:
            raise ValueError(f"Raw string {record.id} appears twice")
        seen.add(record.id)
        utm = NormalizedUtm.of(record)
        key = (utm, record.workspace_id)
        outcomes = decided.get(key)
        if outcomes is None:
            outcomes = decided[key] = _classify_string(utm, record.workspace_id, compiled)
        classifications.extend(Classification(record.id, *outcome) for outcome in outcomes)
    return RunResult(ruleset.version_id, ENGINE_VERSION, tuple(classifications))


def _classify_string(utm: NormalizedUtm, workspace_id: int, compiled: _Compiled) -> tuple[_Outcome, ...]:
    outcomes: list[_Outcome] = []
    for dimension in compiled.dimensions:
        outcomes.append(_decide(dimension, utm, compiled.candidates(dimension.key, None), NETWORK))
        if dimension.layer == WORKSPACE:
            outcomes.append(_decide(dimension, utm, compiled.candidates(dimension.key, workspace_id), WORKSPACE))

    campaign_value = _single_value(next((o for o in outcomes if o.dimension == CAMPAIGN), None))
    if campaign_value is not None:
        for index, outcome in enumerate(outcomes):
            if outcome.dimension == PRODUCT and outcome.status == UNCLASSIFIED:
                lineup = compiled.lineup(campaign_value, workspace_id if outcome.lens == WORKSPACE else None)
                if lineup:
                    outcomes[index] = _from_lineup(outcome, lineup)
    return tuple(outcomes)


def _decide(dimension: Dimension, utm: NormalizedUtm, candidates: list[_Candidate], lens: str) -> _Outcome:
    matched = [c.rule for c in candidates if c.matches(utm.field(c.rule.field))]
    return _resolve(dimension, matched, lens)


def _resolve(dimension: Dimension, matched: list[Rule], lens: str) -> _Outcome:
    """Precedence: the lowest priority number wins; a disagreeing tie is a conflict."""
    if not matched:
        return _Outcome(dimension.key, lens, UNCLASSIFIED, None, ())
    best = min(rule.priority for rule in matched)
    tier = [rule for rule in matched if rule.priority == best]
    assigns = [rule for rule in tier if rule.action == ASSIGN]
    ignores = [rule for rule in tier if rule.action == IGNORE]
    values = sorted({rule.value_id for rule in assigns if rule.value_id is not None})

    if (assigns and ignores) or (len(values) > 1 and not dimension.multi_valued):
        hits = sort_hits(Hit(CANDIDATE, rule.value_id, rule.id) for rule in tier)
        return _Outcome(dimension.key, lens, CONFLICT, BY_RULE, hits)
    if ignores:
        hits = sort_hits(Hit(FIRED, None, rule.id) for rule in ignores)
        return _Outcome(dimension.key, lens, IGNORED, BY_RULE, hits)

    # Each value gets an equal share of the string's spend; rules that agree on
    # a value split its share, so shares always add up to 1.
    share = 1 / len(values)
    hits_list: list[Hit] = []
    for value_id in values:
        backers = [rule for rule in assigns if rule.value_id == value_id]
        hits_list.extend(Hit(FIRED, value_id, rule.id, weight=share / len(backers)) for rule in backers)
    return _Outcome(dimension.key, lens, CLASSIFIED, BY_RULE, sort_hits(hits_list))


def _from_lineup(outcome: _Outcome, lineup: tuple[CampaignProduct, ...]) -> _Outcome:
    total = sum(row.weight for row in lineup)
    hits = sort_hits(
        Hit(FIRED, row.product_value_id, campaign_product_id=row.id, weight=row.weight / total) for row in lineup
    )
    return outcome._replace(status=CLASSIFIED, method=BY_LINEUP, hits=hits)


def _single_value(outcome: _Outcome | None) -> int | None:
    if outcome is None or outcome.status != CLASSIFIED:
        return None
    values = {hit.value_id for hit in outcome.hits}
    return values.pop() if len(values) == 1 else None


@dataclass(frozen=True)
class RuleMatch:
    """A rule whose pattern matches a string, and what became of it."""

    rule: Rule
    role: str   # fired, candidate (a side of a conflict), shadowed (outranked) or inactive


def explain(record: UtmRecord, ruleset: Ruleset, dimension: str, lens: str = NETWORK) -> list[RuleMatch]:
    """Every rule that matches this string on one dimension, lowest priority number first.

    Answers both "why did this string get that value?" and "why didn't my rule
    fire?". Values inherited from a campaign's product lineup come from no
    rule, so they don't appear here.
    """
    dim = ruleset.dimension(dimension)
    workspace_id = record.workspace_id if lens == WORKSPACE and dim.layer == WORKSPACE else None
    utm = NormalizedUtm.of(record)
    matched = [
        rule
        for rule in ruleset.rules
        if rule.dimension == dimension
        and (rule.workspace_id is None or rule.workspace_id == workspace_id)
        and compile_pattern(rule.match_type, rule.pattern)(utm.field(rule.field))
    ]
    live = [rule for rule in matched if rule.active]
    tier_role = CANDIDATE if _resolve(dim, live, lens).status == CONFLICT else FIRED
    best = min((rule.priority for rule in live), default=None)
    explained = []
    for rule in sorted(matched, key=lambda r: (r.priority, r.id)):
        if not rule.active:
            role = INACTIVE
        elif rule.priority == best:
            role = tier_role
        else:
            role = SHADOWED
        explained.append(RuleMatch(rule, role))
    return explained


def preview_rule(
    records: Iterable[UtmRecord], *, pattern: str, match_type: str = "contains", field: str = "any"
) -> list[UtmRecord]:
    """The records a pattern would match before any precedence: what "test this rule" shows."""
    matches = compile_pattern(match_type, pattern)
    return [record for record in records if matches(NormalizedUtm.of(record).field(field))]


def input_fingerprint(records: Iterable[UtmRecord]) -> str:
    """SHA-256 of the raw strings a run read, exactly as imported."""
    digest = hashlib.sha256()
    for record in sorted(records, key=lambda r: r.id):
        fields = (
            str(record.id),
            str(record.workspace_id),
            record.source,
            record.medium,
            record.campaign,
            record.content,
            record.term,
        )
        digest.update("\x1f".join(fields).encode())
        digest.update(b"\n")
    return digest.hexdigest()


def audit_result(result: RunResult, ruleset: Ruleset) -> list[str]:
    """Check a result against the engine's promises; returns the problems (empty when sound).

    Independent of how the result was made, so it also catches a future engine
    change that breaks a promise, or a stored run that was altered: every
    conflict assigns nothing and keeps at least two candidates, no single-valued
    dimension holds two values, spend shares add up to 1, and nothing from an
    operator's own rules or lineups reaches the network lens.
    """
    rules = {rule.id: rule for rule in ruleset.rules}
    lineup_rows = {row.id: row for row in ruleset.campaign_products}
    dimensions = {d.key: d for d in ruleset.dimensions}
    problems: list[str] = []
    seen: set[tuple[int, str, str]] = set()

    for c in result.classifications:
        where = f"string {c.raw_string_id}, {c.dimension}, {c.lens} lens"
        key = (c.raw_string_id, c.dimension, c.lens)
        if key in seen:
            problems.append(f"{where}: more than one outcome")
        seen.add(key)
        dimension = dimensions.get(c.dimension)
        if dimension is None:
            problems.append(f"{where}: not a dimension of version {ruleset.version_id}")
            continue
        if c.lens == WORKSPACE and dimension.layer != WORKSPACE:
            problems.append(f"{where}: a shared network dimension has no operator lens")

        fired = [hit for hit in c.hits if hit.role == FIRED]
        candidates = [hit for hit in c.hits if hit.role == CANDIDATE]
        if c.status == UNCLASSIFIED:
            if c.hits:
                problems.append(f"{where}: unclassified, yet names rules")
        elif c.status == CONFLICT:
            if fired or len(candidates) < 2:
                problems.append(f"{where}: a conflict must assign nothing and keep at least two candidates")
        elif c.status == IGNORED:
            if candidates or not fired or any(hit.value_id is not None for hit in fired):
                problems.append(f"{where}: ignored must come from ignore rules alone")
        elif c.status == CLASSIFIED:
            if candidates or not fired:
                problems.append(f"{where}: classified must come from fired rules alone")
            if not dimension.multi_valued and len(c.value_ids) != 1:
                problems.append(f"{where}: a single-valued dimension holds {len(c.value_ids)} values")
            total = sum(hit.weight or 0.0 for hit in fired)
            if abs(total - 1.0) > 1e-9:
                problems.append(f"{where}: spend shares add up to {total:.6f}, not 1")
        else:
            problems.append(f"{where}: unknown status {c.status!r}")

        for hit in c.hits:
            if hit.rule_id is not None:
                rule = rules.get(hit.rule_id)
                if rule is None:
                    problems.append(f"{where}: rule revision {hit.rule_id} is not in version {ruleset.version_id}")
                elif not rule.active or rule.dimension != c.dimension:
                    problems.append(f"{where}: rule {rule.rule_key} can't decide this outcome")
                elif c.lens == NETWORK and rule.workspace_id is not None:
                    problems.append(f"{where}: operator rule {rule.rule_key} reached the network lens")
                elif hit.role == FIRED and (rule.action == IGNORE) != (c.status == IGNORED):
                    problems.append(f"{where}: rule {rule.rule_key}'s action doesn't match the outcome")
                elif hit.value_id != rule.value_id:
                    problems.append(f"{where}: rule {rule.rule_key} assigns a different value")
            if hit.campaign_product_id is not None:
                row = lineup_rows.get(hit.campaign_product_id)
                if row is None:
                    problems.append(f"{where}: lineup row {hit.campaign_product_id} is not in version {ruleset.version_id}")
                elif c.lens == NETWORK and row.workspace_id is not None:
                    problems.append(f"{where}: an operator's lineup reached the network lens")
    return problems
