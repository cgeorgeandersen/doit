"""Plain data that flows into and out of the engine. No database, no files."""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from dataclasses import dataclass
from functools import cached_property

# Lenses. The network lens sees only shared rules and is what network roll-ups
# use; an operator's workspace lens also sees that operator's own rules, on
# workspace-layer dimensions.
NETWORK = "network"
WORKSPACE = "workspace"

# The outcome for one string on one dimension in one lens.
CLASSIFIED = "classified"
CONFLICT = "conflict"
UNCLASSIFIED = "unclassified"
IGNORED = "ignored"
STATUSES = (CLASSIFIED, CONFLICT, UNCLASSIFIED, IGNORED)

# What a rule does when it wins.
ASSIGN = "assign"
IGNORE = "ignore"

# Hit roles: a fired hit decided the outcome; candidates are the sides of a conflict.
FIRED = "fired"
CANDIDATE = "candidate"

# How a classified outcome was reached.
BY_RULE = "rule"
BY_LINEUP = "campaign_bridge"


@dataclass(frozen=True)
class Dimension:
    id: int
    key: str
    label: str
    layer: str = NETWORK
    multi_valued: bool = False
    sort_order: int = 0


@dataclass(frozen=True)
class DimensionValue:
    id: int
    dimension: str
    value: str
    active: bool = True


@dataclass(frozen=True)
class Rule:
    """One immutable revision of a rule."""

    id: int
    rule_key: str
    revision: int
    dimension: str
    field: str
    match_type: str
    pattern: str
    action: str
    value_id: int | None
    priority: int
    workspace_id: int | None = None
    owner: str = ""
    active: bool = True
    note: str = ""
    created_at: str = ""


@dataclass(frozen=True)
class CampaignProduct:
    """One row of a campaign's product lineup, in the network's lens or one operator's."""

    id: int
    campaign_value_id: int
    product_value_id: int
    workspace_id: int | None
    weight: float


@dataclass(frozen=True)
class Ruleset:
    """Everything one ruleset version needs to classify: dimensions, values, rules, lineups."""

    version_id: int
    dimensions: tuple[Dimension, ...]
    values: tuple[DimensionValue, ...]
    rules: tuple[Rule, ...]
    campaign_products: tuple[CampaignProduct, ...] = ()

    @cached_property
    def _values_by_id(self) -> dict[int, DimensionValue]:
        return {value.id: value for value in self.values}

    def dimension(self, key: str) -> Dimension:
        for dimension in self.dimensions:
            if dimension.key == key:
                return dimension
        raise LookupError(f"No dimension {key!r}")

    def label(self, value_id: int | None) -> str | None:
        return None if value_id is None else self._values_by_id[value_id].value

    def labels(self, value_ids: Iterable[int]) -> list[str]:
        return [self._values_by_id[value_id].value for value_id in value_ids]


@dataclass(frozen=True)
class UtmRecord:
    """One raw string as the engine sees it: its id, its operator and its five UTM fields."""

    id: int
    workspace_id: int
    source: str = ""
    medium: str = ""
    campaign: str = ""
    content: str = ""
    term: str = ""


@dataclass(frozen=True)
class Hit:
    """A rule, or a lineup row, behind an outcome, with the value it gave."""

    role: str
    value_id: int | None
    rule_id: int | None = None
    campaign_product_id: int | None = None
    weight: float | None = None   # share of the string's spend; set on fired hits of classified outcomes


def sort_hits(hits: Iterable[Hit]) -> tuple[Hit, ...]:
    """The one canonical order for hits, used by the engine and by stored-run loading alike."""

    def key(hit: Hit) -> tuple[str, int, int, int]:
        return (
            hit.role,
            -1 if hit.value_id is None else hit.value_id,
            -1 if hit.rule_id is None else hit.rule_id,
            -1 if hit.campaign_product_id is None else hit.campaign_product_id,
        )

    return tuple(sorted(hits, key=key))


@dataclass(frozen=True)
class Classification:
    """The outcome for one raw string on one dimension in one lens."""

    raw_string_id: int
    dimension: str
    lens: str
    status: str
    method: str | None
    hits: tuple[Hit, ...] = ()

    @property
    def value_ids(self) -> tuple[int, ...]:
        """The values assigned: empty unless classified."""
        if self.status != CLASSIFIED:
            return ()
        return tuple(sorted({hit.value_id for hit in self.hits if hit.value_id is not None}))

    @property
    def value_id(self) -> int | None:
        """The single value assigned, or None (unclassified, conflict, ignored, or several values)."""
        value_ids = self.value_ids
        return value_ids[0] if len(value_ids) == 1 else None

    @property
    def rule_ids(self) -> tuple[int, ...]:
        """The rules behind the outcome: the ones that fired, or the sides of a conflict."""
        return tuple(sorted({hit.rule_id for hit in self.hits if hit.rule_id is not None}))

    @property
    def allocation(self) -> tuple[tuple[int, float], ...]:
        """Each assigned value with its share of the string's spend."""
        shares: dict[int, float] = {}
        if self.status == CLASSIFIED:
            for hit in self.hits:
                if hit.value_id is not None and hit.weight is not None:
                    shares[hit.value_id] = shares.get(hit.value_id, 0.0) + hit.weight
        return tuple(sorted((value_id, round(share, 9)) for value_id, share in shares.items()))


@dataclass(frozen=True)
class RunResult:
    """Every outcome of one classification run, and the ruleset version that produced it."""

    version_id: int
    engine_version: str
    classifications: tuple[Classification, ...]

    @cached_property
    def _index(self) -> dict[tuple[int, str, str], Classification]:
        return {(c.raw_string_id, c.dimension, c.lens): c for c in self.classifications}

    def get(self, raw_string_id: int, dimension: str, lens: str = NETWORK) -> Classification | None:
        return self._index.get((raw_string_id, dimension, lens))

    def where(
        self, *, status: str | None = None, dimension: str | None = None, lens: str | None = None
    ) -> list[Classification]:
        return [
            c
            for c in self.classifications
            if (status is None or c.status == status)
            and (dimension is None or c.dimension == dimension)
            and (lens is None or c.lens == lens)
        ]

    @property
    def conflicts(self) -> list[Classification]:
        return self.where(status=CONFLICT)

    @property
    def unclassified(self) -> list[Classification]:
        return self.where(status=UNCLASSIFIED)

    def fingerprint(self) -> str:
        """SHA-256 of every outcome and hit, in a canonical order.

        Two results with the same fingerprint assigned the same values, by the
        same rule revisions and lineup rows, with the same spend shares.
        """
        digest = hashlib.sha256()
        for c in sorted(self.classifications, key=lambda c: (c.raw_string_id, c.dimension, c.lens)):
            parts = [str(c.raw_string_id), c.dimension, c.lens, c.status, c.method or ""]
            for hit in sort_hits(c.hits):
                weight = "" if hit.weight is None else f"{hit.weight:.9f}"
                parts.append(f"{hit.role},{hit.value_id},{hit.rule_id},{hit.campaign_product_id},{weight}")
            digest.update("\x1f".join(parts).encode())
            digest.update(b"\n")
        return digest.hexdigest()
