"""The controlled vocabulary: operators (workspaces), dimensions, their values, and campaigns.

Anyone can add a value to a dimension. Values are never renamed or deleted,
only deactivated, because rules and past results point at them. Creating a
dimension is an admin action: a new dimension changes what every report
means, so it is not something to do in passing from a review queue.
"""

from __future__ import annotations

import operator
import sqlite3

from .db import transaction, utc_now
from .models import NETWORK, WORKSPACE, Dimension, DimensionValue

CAMPAIGN = "campaign"
PRODUCT = "product"


def clean_name(text: object) -> str:
    """A label with surrounding and repeated whitespace removed."""
    cleaned = " ".join(str(text).split())
    if not cleaned:
        raise ValueError("A name can't be blank")
    return cleaned


def _as_id(value: object) -> int | None:
    """An integer id (including numpy's), or None when the value is a name."""
    if isinstance(value, bool) or isinstance(value, str):
        return None
    try:
        return operator.index(value)
    except TypeError:
        return None


# ── operators ───────────────────────────────────────────────────────────────

def create_workspace(conn: sqlite3.Connection, slug: str, name: str) -> int:
    with transaction(conn):
        cursor = conn.execute(
            "INSERT INTO workspaces (slug, name, created_at) VALUES (?, ?, ?)", (slug, clean_name(name), utc_now())
        )
    return cursor.lastrowid


def workspace_id(conn: sqlite3.Connection, workspace: str | int) -> int:
    """An operator's id, from its id, slug or name (any case)."""
    as_id = _as_id(workspace)
    if as_id is not None:
        row = conn.execute("SELECT id FROM workspaces WHERE id = ?", (as_id,)).fetchone()
    else:
        text = clean_name(workspace)
        row = conn.execute(
            "SELECT id FROM workspaces WHERE slug = lower(?) OR name = ? COLLATE NOCASE", (text, text)
        ).fetchone()
    if row is None:
        raise LookupError(f"No operator {workspace!r}")
    return row["id"]


def list_workspaces(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT id, slug, name FROM workspaces ORDER BY name").fetchall()


# ── dimensions ──────────────────────────────────────────────────────────────

def create_dimension(
    conn: sqlite3.Connection,
    key: str,
    label: str,
    *,
    created_by: str,
    admin: bool = False,
    layer: str = NETWORK,
    multi_valued: bool = False,
    sort_order: int = 0,
    description: str = "",
) -> int:
    """Add a dimension. Admin only: to extend the vocabulary, add a value to an existing dimension."""
    if not admin:
        raise PermissionError(
            "Creating a dimension is an admin action. To extend the vocabulary, add a value to an existing dimension."
        )
    if layer not in (NETWORK, WORKSPACE):
        raise ValueError(f"layer must be {NETWORK!r} or {WORKSPACE!r}")
    with transaction(conn):
        cursor = conn.execute(
            "INSERT INTO dimensions (key, label, layer, multi_valued, sort_order, description, created_by, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (key, clean_name(label), layer, int(multi_valued), sort_order, description, created_by, utc_now()),
        )
    return cursor.lastrowid


def load_dimensions(conn: sqlite3.Connection) -> tuple[Dimension, ...]:
    rows = conn.execute(
        "SELECT id, key, label, layer, multi_valued, sort_order FROM dimensions ORDER BY sort_order, key"
    )
    return tuple(
        Dimension(row["id"], row["key"], row["label"], row["layer"], bool(row["multi_valued"]), row["sort_order"])
        for row in rows
    )


def get_dimension(conn: sqlite3.Connection, key: str) -> Dimension:
    for dimension in load_dimensions(conn):
        if dimension.key == key:
            return dimension
    raise LookupError(f"No dimension {key!r}")


# ── values ──────────────────────────────────────────────────────────────────

def add_value(
    conn: sqlite3.Connection, dimension: str, value: str, *, created_by: str, description: str = ""
) -> int:
    """Add a controlled value to a dimension. Anyone may; names are unique per dimension, ignoring case."""
    dim = get_dimension(conn, dimension)
    name = clean_name(value)
    try:
        with transaction(conn):
            cursor = conn.execute(
                "INSERT INTO dimension_values (dimension_id, value, description, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (dim.id, name, description, created_by, utc_now()),
            )
    except sqlite3.IntegrityError as exc:
        if "UNIQUE" in str(exc):
            raise ValueError(f"{dim.label} already has a value named {name!r}") from None
        raise
    return cursor.lastrowid


def value_id(conn: sqlite3.Connection, dimension: str, value: str | int) -> int:
    """A value's id, from its id or its name (any case), checked to belong to the dimension."""
    as_id = _as_id(value)
    if as_id is not None:
        row = conn.execute(
            "SELECT v.id FROM dimension_values v JOIN dimensions d ON d.id = v.dimension_id"
            " WHERE v.id = ? AND d.key = ?",
            (as_id, dimension),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT v.id FROM dimension_values v JOIN dimensions d ON d.id = v.dimension_id"
            " WHERE d.key = ? AND v.value = ? COLLATE NOCASE",
            (dimension, clean_name(value)),
        ).fetchone()
    if row is None:
        raise LookupError(f"{value!r} is not a value of {dimension}")
    return row["id"]


def load_values(conn: sqlite3.Connection) -> tuple[DimensionValue, ...]:
    rows = conn.execute(
        "SELECT v.id, d.key, v.value, v.active FROM dimension_values v JOIN dimensions d ON d.id = v.dimension_id"
        " ORDER BY d.sort_order, v.id"
    )
    return tuple(DimensionValue(row["id"], row["key"], row["value"], bool(row["active"])) for row in rows)


def set_value_active(conn: sqlite3.Connection, value_id: int, active: bool) -> None:
    """Hide a value from new rules (or bring it back). Existing rules and results keep pointing at it."""
    with transaction(conn):
        conn.execute("UPDATE dimension_values SET active = ? WHERE id = ?", (int(active), value_id))


# ── campaigns ───────────────────────────────────────────────────────────────

def create_campaign(
    conn: sqlite3.Connection,
    name: str,
    *,
    start_date: str,
    end_date: str,
    created_by: str,
    workspace: str | int | None = None,
    description: str = "",
) -> int:
    """Add a campaign value and its dates. With an operator, it's that operator's local campaign."""
    with transaction(conn):
        value = add_value(conn, CAMPAIGN, name, created_by=created_by, description=description)
        operator_id = None if workspace is None else workspace_id(conn, workspace)
        cursor = conn.execute(
            "INSERT INTO campaigns (value_id, start_date, end_date, workspace_id, created_by, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (value, start_date, end_date, operator_id, created_by, utc_now()),
        )
    return cursor.lastrowid


def campaign_id(conn: sqlite3.Connection, campaign: str | int) -> int:
    """A campaign row's id, from its campaign value's id or name."""
    row = conn.execute(
        "SELECT id FROM campaigns WHERE value_id = ?", (value_id(conn, CAMPAIGN, campaign),)
    ).fetchone()
    if row is None:
        raise LookupError(f"{campaign!r} is a campaign value with no campaign record (dates, lineup)")
    return row["id"]


def list_campaigns(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT c.id, v.id AS value_id, v.value AS name, c.start_date, c.end_date, w.slug AS workspace"
        " FROM campaigns c JOIN dimension_values v ON v.id = c.value_id"
        " LEFT JOIN workspaces w ON w.id = c.workspace_id ORDER BY c.start_date, v.value"
    ).fetchall()
