"""Versioned rules: every change to the ruleset creates a new version.

Rules are data in the `rules` table, never code. A rule row is immutable:
editing a rule writes a new revision (same rule_key, revision + 1), and a
version is a manifest listing exactly which revisions, and which campaign
product lineup rows, it contains. Like a git commit pointing at exact file
contents, a version means the same thing forever, which is what lets an old
classification run be reproduced exactly.

    with change_ruleset(conn, author="george", message="Summer Cup typos") as change:
        change.add_rule(dimension="campaign", field="campaign", pattern="sumer cup",
                        value="Summer Cup 2026")
        change.deactivate_rule("R0007")
    change.version_id   # the new version, or None if nothing actually changed
"""

from __future__ import annotations

import math
import operator
import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass

from . import taxonomy
from .db import utc_now
from .diff import VersionDiff, diff_rulesets
from .matching import FIELDS, MATCH_TYPES, compile_pattern
from .models import ASSIGN, IGNORE, WORKSPACE, CampaignProduct, Dimension, Rule, Ruleset

DEFAULT_PRIORITY = 100

# What edit_rule() may change. A rule's dimension is part of what it is.
EDITABLE = ("field", "match_type", "pattern", "action", "value", "priority", "workspace", "owner", "active", "note")

_RULE_COLUMNS = (
    "r.id, r.rule_key, r.revision, d.key AS dimension, r.field, r.match_type, r.pattern, r.action,"
    " r.value_id, r.priority, r.workspace_id, r.owner, r.active, r.note, r.created_at"
)

Lineups = dict[tuple[int, int | None], dict[int, int]]   # (campaign, operator) -> {product value: lineup row}


@dataclass(frozen=True)
class VersionInfo:
    id: int
    parent_id: int | None
    message: str
    author: str
    created_at: str
    active_rules: int
    lineup_rows: int


def current_version_id(conn: sqlite3.Connection) -> int:
    (latest,) = conn.execute("SELECT MAX(id) FROM ruleset_versions").fetchone()
    if latest is None:
        raise LookupError("There are no ruleset versions yet; run init_db() first")
    return latest


def list_versions(conn: sqlite3.Connection) -> list[VersionInfo]:
    rows = conn.execute(
        """SELECT v.id, v.parent_id, v.message, v.author, v.created_at,
                  (SELECT COUNT(*) FROM ruleset_version_rules m JOIN rules r ON r.id = m.rule_id
                    WHERE m.version_id = v.id AND r.active = 1) AS active_rules,
                  (SELECT COUNT(*) FROM ruleset_version_campaign_products p
                    WHERE p.version_id = v.id) AS lineup_rows
             FROM ruleset_versions v ORDER BY v.id"""
    )
    return [VersionInfo(**dict(row)) for row in rows]


def load_ruleset(conn: sqlite3.Connection, version_id: int | None = None) -> Ruleset:
    """Everything one version needs to classify. Defaults to the current version."""
    if version_id is None:
        version_id = current_version_id(conn)
    elif conn.execute("SELECT 1 FROM ruleset_versions WHERE id = ?", (version_id,)).fetchone() is None:
        raise LookupError(f"There is no ruleset version {version_id}")
    rules = conn.execute(
        f"""SELECT {_RULE_COLUMNS} FROM ruleset_version_rules m
              JOIN rules r ON r.id = m.rule_id JOIN dimensions d ON d.id = r.dimension_id
             WHERE m.version_id = ? ORDER BY r.rule_key""",
        (version_id,),
    )
    lineups = conn.execute(
        """SELECT cp.id, c.value_id AS campaign_value_id, cp.product_value_id, cp.workspace_id, cp.weight
             FROM ruleset_version_campaign_products m
             JOIN campaign_products cp ON cp.id = m.campaign_product_id
             JOIN campaigns c ON c.id = cp.campaign_id
            WHERE m.version_id = ? ORDER BY cp.id""",
        (version_id,),
    )
    # Dimensions and values aren't versioned: they are append-only and never
    # renamed, so today's vocabulary contains everything any version used.
    return Ruleset(
        version_id=version_id,
        dimensions=taxonomy.load_dimensions(conn),
        values=taxonomy.load_values(conn),
        rules=tuple(_rule_from_row(row) for row in rules),
        campaign_products=tuple(CampaignProduct(**dict(row)) for row in lineups),
    )


def diff_versions(conn: sqlite3.Connection, from_version: int, to_version: int) -> VersionDiff:
    return diff_rulesets(load_ruleset(conn, from_version), load_ruleset(conn, to_version))


@contextmanager
def change_ruleset(conn: sqlite3.Connection, *, author: str, message: str) -> Iterator[Changeset]:
    """Group changes into one new version, written when the block ends without an error.

    If the block raises, nothing is written. If its changes add up to no
    change at all, no version is created and `version_id` stays None.
    """
    if conn.in_transaction:
        raise RuntimeError("change_ruleset() runs its own transaction; don't call it inside another one")
    conn.execute("BEGIN IMMEDIATE")
    try:
        change = Changeset(conn, author=author, message=message)
        yield change
        changed = change._commit()
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT" if changed else "ROLLBACK")


def revert_to_version(conn: sqlite3.Connection, version_id: int, *, author: str, message: str | None = None) -> int | None:
    """Make the current ruleset what `version_id` was, as a new version (history is kept)."""
    with change_ruleset(conn, author=author, message=message or f"Revert to version {version_id}") as change:
        change.restore(version_id)
    return change.version_id


class Changeset:
    """Changes that become one new ruleset version. Create one with change_ruleset()."""

    def __init__(self, conn: sqlite3.Connection, *, author: str, message: str) -> None:
        self._conn = conn
        self.author = _required(author, "an author")
        self.message = _required(message, "a message saying why the rules are changing")
        self.parent_id = current_version_id(conn)
        self.version_id: int | None = None
        self._dimensions = {d.key: d for d in taxonomy.load_dimensions(conn)}
        self._parent_rules = self._manifest_rules(self.parent_id)
        self._parent_lineups = self._manifest_lineups(self.parent_id)
        self._rules = dict(self._parent_rules)
        self._lineups: Lineups = {key: dict(rows) for key, rows in self._parent_lineups.items()}

    # ── rules ───────────────────────────────────────────────────────────────

    def add_rule(
        self,
        *,
        dimension: str,
        pattern: str,
        value: str | int | None = None,
        match_type: str = "contains",
        field: str = "any",
        priority: int = DEFAULT_PRIORITY,
        workspace: str | int | None = None,
        owner: str | None = None,
        action: str = ASSIGN,
        note: str = "",
    ) -> Rule:
        dim = self._dimension(dimension)
        spec = self._validate(
            dim,
            field=field,
            match_type=match_type,
            pattern=pattern,
            action=action,
            value=value,
            priority=priority,
            workspace=workspace,
            owner=owner,
            note=note,
        )
        return self._write_revision(self._next_rule_key(), dim, spec)

    def edit_rule(self, rule_key: str, **changes: object) -> Rule:
        """Change a rule by writing its next revision. A change to nothing writes nothing."""
        unknown = sorted(set(changes) - set(EDITABLE))
        if unknown:
            raise ValueError(
                f"Can't change {', '.join(unknown)} on a rule. Its dimension is part of what it is: add a new rule instead."
            )
        current = self.rule(rule_key)
        if changes.get("action") == IGNORE and "value" not in changes:
            changes["value"] = None
        merged = {
            "field": current.field,
            "match_type": current.match_type,
            "pattern": current.pattern,
            "action": current.action,
            "value": current.value_id,
            "priority": current.priority,
            "workspace": current.workspace_id,
            "owner": current.owner,
            "active": current.active,
            "note": current.note,
            **changes,
        }
        dim = self._dimensions[current.dimension]
        spec = self._validate(dim, **merged)
        if spec == _spec_of(current):
            return current
        base_id = self._parent_rules.get(rule_key)
        if base_id is not None:
            base = _load_rule(self._conn, base_id)
            if spec == _spec_of(base):   # back to exactly what the parent version had
                self._rules[rule_key] = base_id
                return base
        return self._write_revision(rule_key, dim, spec)

    def deactivate_rule(self, rule_key: str) -> Rule:
        return self.edit_rule(rule_key, active=False)

    def reactivate_rule(self, rule_key: str) -> Rule:
        return self.edit_rule(rule_key, active=True)

    def rule(self, rule_key: str) -> Rule:
        """The rule as it stands in this changeset."""
        rule_id = self._rules.get(rule_key)
        if rule_id is None:
            raise LookupError(f"There is no rule {rule_key} in version {self.parent_id}")
        return _load_rule(self._conn, rule_id)

    # ── campaign product lineups ────────────────────────────────────────────

    def set_lineup(
        self, campaign: str | int, products: Mapping[str | int, float], *, workspace: str | int | None = None
    ) -> None:
        """Replace one campaign's product lineup in one lens, with relative weights.

        Without an operator it's the network lineup. An operator's own lineup
        replaces the network's for that operator's strings only. An empty
        mapping removes the lineup (an operator's removal falls back to the
        network lineup).
        """
        campaign_id = taxonomy.campaign_id(self._conn, campaign)
        operator_id = None if workspace is None else taxonomy.workspace_id(self._conn, workspace)
        wanted: dict[int, float] = {}
        for product, weight in products.items():
            product_id = taxonomy.value_id(self._conn, taxonomy.PRODUCT, product)
            weight = float(weight)
            if not (weight > 0 and math.isfinite(weight)):
                raise ValueError(f"Lineup weights must be positive numbers; got {weight} for {product!r}")
            if product_id in wanted:
                raise ValueError(f"{product!r} appears twice in the lineup")
            wanted[product_id] = weight

        key = (campaign_id, operator_id)
        current = self._lineups.get(key, {})
        current_weights = self._lineup_weights(current)
        if current_weights == wanted:
            return
        parent = self._parent_lineups.get(key, {})
        parent_weights = self._lineup_weights(parent)
        rows: dict[int, int] = {}
        for product_id, weight in sorted(wanted.items()):
            if current_weights.get(product_id) == weight:   # an unchanged row carries over
                rows[product_id] = current[product_id]
                continue
            if parent_weights.get(product_id) == weight:    # back to the parent version's row
                rows[product_id] = parent[product_id]
                continue
            cursor = self._conn.execute(
                "INSERT INTO campaign_products (campaign_id, product_value_id, workspace_id, weight, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (campaign_id, product_id, operator_id, weight, self.author, utc_now()),
            )
            rows[product_id] = cursor.lastrowid
        if rows:
            self._lineups[key] = rows
        else:
            self._lineups.pop(key, None)

    # ── whole versions ──────────────────────────────────────────────────────

    def restore(self, version_id: int) -> None:
        """Make this changeset's ruleset exactly what `version_id` was."""
        if self._conn.execute("SELECT 1 FROM ruleset_versions WHERE id = ?", (version_id,)).fetchone() is None:
            raise LookupError(f"There is no ruleset version {version_id}")
        self._rules = self._manifest_rules(version_id)
        self._lineups = self._manifest_lineups(version_id)

    # ── internals ───────────────────────────────────────────────────────────

    def _commit(self) -> bool:
        if self._rules == self._parent_rules and self._lineups == self._parent_lineups:
            return False
        cursor = self._conn.execute(
            "INSERT INTO ruleset_versions (parent_id, message, author, created_at) VALUES (?, ?, ?, ?)",
            (self.parent_id, self.message, self.author, utc_now()),
        )
        self.version_id = cursor.lastrowid
        self._conn.executemany(
            "INSERT INTO ruleset_version_rules (version_id, rule_key, rule_id) VALUES (?, ?, ?)",
            [(self.version_id, key, rule_id) for key, rule_id in sorted(self._rules.items())],
        )
        self._conn.executemany(
            "INSERT INTO ruleset_version_campaign_products (version_id, campaign_product_id) VALUES (?, ?)",
            [(self.version_id, row) for rows in self._lineups.values() for row in sorted(rows.values())],
        )
        return True

    def _validate(
        self,
        dim: Dimension,
        *,
        field: str,
        match_type: str,
        pattern: str,
        action: str,
        value: object,
        priority: object,
        workspace: object,
        owner: object,
        note: object,
        active: object = True,
    ) -> dict[str, object]:
        if field not in FIELDS:
            raise ValueError(f"field must be one of {', '.join(FIELDS)}")
        if match_type not in MATCH_TYPES:
            raise ValueError(f"match_type must be one of {', '.join(MATCH_TYPES)}")
        if not isinstance(pattern, str) or not pattern.strip():
            raise ValueError("A rule needs a pattern")
        compile_pattern(match_type, pattern)   # rejects bad regexes and catch-alls

        if action == ASSIGN:
            if value is None:
                raise ValueError(f"Choose the {dim.label.lower()} value this rule assigns")
            value_id = taxonomy.value_id(self._conn, dim.key, value)
        elif action == IGNORE:
            if value is not None:
                raise ValueError("An ignore rule doesn't assign a value")
            value_id = None
        else:
            raise ValueError(f"action must be {ASSIGN!r} or {IGNORE!r}")

        try:
            if isinstance(priority, bool):
                raise TypeError
            priority = operator.index(priority)
        except TypeError:
            raise ValueError("priority must be a whole number (lower wins)") from None
        if priority < 0:
            raise ValueError("priority can't be negative (lower wins; 0 is the strongest)")

        workspace_id = None
        if workspace is not None:
            if dim.layer != WORKSPACE:
                own = sorted(d.label for d in self._dimensions.values() if d.layer == WORKSPACE)
                raise ValueError(
                    f"{dim.label} is a shared network fact, so only network rules can set it."
                    f" Operators can keep their own rules for: {', '.join(own) or 'nothing yet'}."
                )
            workspace_id = taxonomy.workspace_id(self._conn, workspace)

        return {
            "field": field,
            "match_type": match_type,
            "pattern": pattern,
            "action": action,
            "value_id": value_id,
            "priority": priority,
            "workspace_id": workspace_id,
            "owner": _required(owner or self.author, "an owner"),
            "active": bool(active),
            "note": str(note or ""),
        }

    def _write_revision(self, rule_key: str, dim: Dimension, spec: dict[str, object]) -> Rule:
        # The next number after any revision already written, including one an
        # earlier edit in this same changeset wrote and a later edit replaced.
        (revision,) = self._conn.execute(
            "SELECT COALESCE(MAX(revision), 0) + 1 FROM rules WHERE rule_key = ?", (rule_key,)
        ).fetchone()
        cursor = self._conn.execute(
            """INSERT INTO rules (rule_key, revision, dimension_id, field, match_type, pattern, action, value_id,
                                  priority, workspace_id, owner, active, note, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                rule_key,
                revision,
                dim.id,
                spec["field"],
                spec["match_type"],
                spec["pattern"],
                spec["action"],
                spec["value_id"],
                spec["priority"],
                spec["workspace_id"],
                spec["owner"],
                int(bool(spec["active"])),
                spec["note"],
                self.author,
                utc_now(),
            ),
        )
        self._rules[rule_key] = cursor.lastrowid
        return _load_rule(self._conn, cursor.lastrowid)

    def _next_rule_key(self) -> str:
        (highest,) = self._conn.execute(
            "SELECT COALESCE(MAX(CAST(substr(rule_key, 2) AS INTEGER)), 0) FROM rules"
        ).fetchone()
        return f"R{highest + 1:04d}"

    def _dimension(self, key: str) -> Dimension:
        if key not in self._dimensions:
            raise ValueError(f"There is no {key!r} dimension; use one of {', '.join(self._dimensions)}")
        return self._dimensions[key]

    def _manifest_rules(self, version_id: int) -> dict[str, int]:
        rows = self._conn.execute(
            "SELECT rule_key, rule_id FROM ruleset_version_rules WHERE version_id = ?", (version_id,)
        )
        return {row["rule_key"]: row["rule_id"] for row in rows}

    def _manifest_lineups(self, version_id: int) -> Lineups:
        rows = self._conn.execute(
            """SELECT cp.id, cp.campaign_id, cp.workspace_id, cp.product_value_id
                 FROM ruleset_version_campaign_products m JOIN campaign_products cp ON cp.id = m.campaign_product_id
                WHERE m.version_id = ?""",
            (version_id,),
        )
        lineups: Lineups = {}
        for row in rows:
            lineups.setdefault((row["campaign_id"], row["workspace_id"]), {})[row["product_value_id"]] = row["id"]
        return lineups

    def _lineup_weights(self, rows: dict[int, int]) -> dict[int, float]:
        if not rows:
            return {}
        marks = ",".join("?" * len(rows))
        found = self._conn.execute(
            f"SELECT product_value_id, weight FROM campaign_products WHERE id IN ({marks})", tuple(rows.values())
        )
        return {row["product_value_id"]: row["weight"] for row in found}


def _required(text: object, what: str) -> str:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        raise ValueError(f"A ruleset change needs {what}")
    return cleaned


def _spec_of(rule: Rule) -> dict[str, object]:
    return {
        "field": rule.field,
        "match_type": rule.match_type,
        "pattern": rule.pattern,
        "action": rule.action,
        "value_id": rule.value_id,
        "priority": rule.priority,
        "workspace_id": rule.workspace_id,
        "owner": rule.owner,
        "active": rule.active,
        "note": rule.note,
    }


def _load_rule(conn: sqlite3.Connection, rule_id: int) -> Rule:
    row = conn.execute(
        f"SELECT {_RULE_COLUMNS} FROM rules r JOIN dimensions d ON d.id = r.dimension_id WHERE r.id = ?", (rule_id,)
    ).fetchone()
    return _rule_from_row(row)


def _rule_from_row(row: sqlite3.Row) -> Rule:
    return Rule(
        id=row["id"],
        rule_key=row["rule_key"],
        revision=row["revision"],
        dimension=row["dimension"],
        field=row["field"],
        match_type=row["match_type"],
        pattern=row["pattern"],
        action=row["action"],
        value_id=row["value_id"],
        priority=row["priority"],
        workspace_id=row["workspace_id"],
        owner=row["owner"],
        active=bool(row["active"]),
        note=row["note"],
        created_at=row["created_at"],
    )
