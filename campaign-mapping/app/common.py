"""What every page shares: the database, the cached classification, the sidebar, formatting."""

from __future__ import annotations

import os
import sqlite3
import sys
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import pandas as pd
import streamlit as st

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from campaign_mapping import reports, taxonomy  # noqa: E402
from campaign_mapping.db import connect  # noqa: E402
from campaign_mapping.demo import DEMO_DB, build_demo_db, ensure_demo_db  # noqa: E402
from campaign_mapping.engine import classify  # noqa: E402
from campaign_mapping.models import Ruleset, RunResult  # noqa: E402
from campaign_mapping.rulesets import change_ruleset, current_version_id, load_ruleset  # noqa: E402
from campaign_mapping.runs import load_records  # noqa: E402

DB_PATH = Path(os.environ.get("CAMPAIGN_MAPPING_DB", DEMO_DB))
TARGET = 0.90   # success criterion 1: spend-weighted campaign coverage


def db() -> sqlite3.Connection:
    """A connection for this page run. The demo database is built on first use."""
    ensure_demo_db(DB_PATH)
    return connect(DB_PATH, check_same_thread=False)


def watermark(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COALESCE(MAX(id), 0) FROM raw_strings").fetchone()[0]


@dataclass(frozen=True)
class Snapshot:
    """One ruleset version applied to the data up to a watermark, with the frames the pages read."""

    version_id: int
    watermark: int
    ruleset: Ruleset
    result: RunResult
    records: pd.DataFrame
    outcomes: pd.DataFrame

    @cached_property
    def network(self) -> pd.DataFrame:
        return reports.lens_view(self.records, self.outcomes, self.ruleset.dimensions, reports.NETWORK_LENS)

    @cached_property
    def own(self) -> pd.DataFrame:
        return reports.lens_view(self.records, self.outcomes, self.ruleset.dimensions, reports.OWN_LENS)

    def lens(self, lens: str) -> pd.DataFrame:
        if lens == reports.NETWORK_LENS:
            return self.network
        if lens == reports.OWN_LENS:
            return self.own
        return self.own[self.own["operator_slug"] == lens]

    @property
    def dimension_labels(self) -> dict[str, str]:
        return {d.key: d.label for d in sorted(self.ruleset.dimensions, key=lambda d: d.sort_order)}

    def values(self, dimension: str) -> list[str]:
        return [v.value for v in self.ruleset.values if v.dimension == dimension and v.active]


@st.cache_resource(max_entries=12, show_spinner="Classifying every string…")
def _snapshot(db_path: str, version_id: int, upto: int) -> Snapshot:
    # Versions and raw strings never change, so (version, watermark) names one result forever.
    conn = connect(db_path, check_same_thread=False)
    try:
        ruleset = load_ruleset(conn, version_id)
        result = classify(load_records(conn, max_raw_string_id=upto), ruleset)
        records = reports.records_frame(conn, max_raw_string_id=upto)
    finally:
        conn.close()
    return Snapshot(version_id, upto, ruleset, result, records, reports.outcomes_frame(result, ruleset))


def snapshot(conn: sqlite3.Connection, version_id: int | None = None) -> Snapshot:
    return _snapshot(str(DB_PATH), version_id or current_version_id(conn), watermark(conn))


# ── who is working, and what just happened ──────────────────────────────────

def user() -> str:
    return st.session_state.get("user") or "analyst"


def flash(message: str) -> None:
    st.session_state["flash"] = message


def show_flash() -> None:
    message = st.session_state.pop("flash", None)
    if message:
        st.success(message, icon=":material/check_circle:")


def sidebar() -> None:
    with st.sidebar:
        st.text_input("Your name", key="user", value=user(), help="Recorded as the author of every rule and version you create.")
        conn = db()
        version = current_version_id(conn)
        rows = watermark(conn)
        st.caption(f"Ruleset **version {version}** · {rows:,} raw strings")
        st.caption("Synthetic data. Zestify and its five operators are fictional.")
        with st.popover("Reset the demo", icon=":material/restart_alt:"):
            st.write("Rebuild the database from the bundled synthetic data and starter rules. Every rule, version and import made here is lost.")
            if st.button("Rebuild now", type="primary"):
                build_demo_db(DB_PATH)
                _snapshot.clear()
                flash("Demo rebuilt: starter ruleset, original data.")
                st.rerun()


# ── writing rules from a page ───────────────────────────────────────────────

def write_rule(conn: sqlite3.Connection, *, message: str, **spec) -> None:
    """Add one rule as a new version, then rerun with a confirmation. Shows the error instead if it's refused."""
    spec.setdefault("owner", user())
    try:
        with change_ruleset(conn, author=user(), message=message) as change:
            rule = change.add_rule(**spec)
    except (ValueError, LookupError) as exc:
        st.error(str(exc))
        return
    what = "ignore" if rule.action == "ignore" else spec.get("value")
    flash(f"Version {change.version_id}: rule {rule.rule_key} ({rule.match_type} \"{rule.pattern}\" → {what}).")
    st.rerun()


def add_value_if_new(conn: sqlite3.Connection, dimension: str, value: str) -> None:
    if value and value.casefold() not in {v.casefold() for v in taxonomy_values(conn, dimension)}:
        taxonomy.add_value(conn, dimension, value, created_by=user())


def taxonomy_values(conn: sqlite3.Connection, dimension: str) -> list[str]:
    return [v.value for v in taxonomy.load_values(conn) if v.dimension == dimension]


# ── formatting ──────────────────────────────────────────────────────────────

def money(amount: float) -> str:
    if abs(amount) >= 1_000_000:
        return f"${amount / 1_000_000:,.2f}M"
    if abs(amount) >= 10_000:
        return f"${amount / 1_000:,.0f}K"
    return f"${amount:,.0f}"


def pct(share: float) -> str:
    return f"{share:.1%}"


STATUS_BADGE = {
    "classified": ":green-badge[classified]",
    "conflict": ":orange-badge[conflict]",
    "unclassified": ":gray-badge[unclassified]",
    "ignored": ":blue-badge[ignored]",
}

PERCENT = {"format": "percent", "min_value": 0.0, "max_value": 1.0}
