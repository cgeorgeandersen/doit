"""Builders that keep the engine tests readable: labels in, ids taken care of."""

from __future__ import annotations

import itertools

from campaign_mapping.models import (
    ASSIGN,
    NETWORK,
    WORKSPACE,
    CampaignProduct,
    Dimension,
    DimensionValue,
    Rule,
    Ruleset,
    UtmRecord,
)

NORTHGATE = 1
PINECREST = 2


class RulesetBuilder:
    """A ruleset built in memory from labels, for engine tests that need no database."""

    def __init__(self) -> None:
        self._ids = itertools.count(1)
        self._dimensions: dict[str, Dimension] = {}
        self._values: dict[tuple[str, str], DimensionValue] = {}
        self._rules: list[Rule] = []
        self._lineups: list[CampaignProduct] = []

    @classmethod
    def zestify(cls) -> RulesetBuilder:
        """The seeded shape: campaign, objective and type shared; product multi-valued and per operator."""
        return (
            cls()
            .dimension("campaign")
            .dimension("product", layer=WORKSPACE, multi_valued=True)
            .dimension("objective")
            .dimension("type")
        )

    def dimension(self, key: str, *, layer: str = NETWORK, multi_valued: bool = False) -> RulesetBuilder:
        self._dimensions[key] = Dimension(
            next(self._ids), key, key.title(), layer, multi_valued, len(self._dimensions)
        )
        return self

    def value(self, dimension: str, label: str) -> int:
        key = (dimension, label)
        if key not in self._values:
            self._values[key] = DimensionValue(next(self._ids), dimension, label)
        return self._values[key].id

    def rule(
        self,
        dimension: str,
        pattern: str,
        value: str | None = None,
        *,
        match_type: str = "contains",
        field: str = "any",
        priority: int = 100,
        workspace: int | None = None,
        action: str = ASSIGN,
        active: bool = True,
    ) -> Rule:
        rule_id = next(self._ids)
        rule = Rule(
            id=rule_id,
            rule_key=f"R{rule_id:04d}",
            revision=1,
            dimension=dimension,
            field=field,
            match_type=match_type,
            pattern=pattern,
            action=action,
            value_id=None if value is None else self.value(dimension, value),
            priority=priority,
            workspace_id=workspace,
            owner="tests",
            active=active,
        )
        self._rules.append(rule)
        return rule

    def lineup(self, campaign: str, products: dict[str, float], *, workspace: int | None = None) -> RulesetBuilder:
        campaign_id = self.value("campaign", campaign)
        for product, weight in products.items():
            self._lineups.append(
                CampaignProduct(next(self._ids), campaign_id, self.value("product", product), workspace, weight)
            )
        return self

    def build(self, version_id: int = 1) -> Ruleset:
        return Ruleset(
            version_id,
            tuple(self._dimensions.values()),
            tuple(self._values.values()),
            tuple(self._rules),
            tuple(self._lineups),
        )


def utm(
    record_id: int,
    *,
    campaign: str = "",
    source: str = "",
    medium: str = "",
    content: str = "",
    term: str = "",
    workspace: int = NORTHGATE,
) -> UtmRecord:
    return UtmRecord(record_id, workspace, source, medium, campaign, content, term)
