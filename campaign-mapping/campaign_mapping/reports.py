"""The tables behind the app, as pandas DataFrames: coverage, the review queue, exports.

No Streamlit here, so the same numbers can come from a script, a notebook or
an API. Everything starts from two frames: `records_frame()` (one row per raw
string, with its normalized fields) and `outcomes_frame()` (one row per
string, dimension and lens), joined through a lens by `lens_view()`.
"""

from __future__ import annotations

import io
import sqlite3
from collections.abc import Sequence

import pandas as pd

from .matching import compile_pattern
from .models import (
    BY_LINEUP,
    CANDIDATE,
    CLASSIFIED,
    CONFLICT,
    FIRED,
    IGNORED,
    NETWORK,
    UNCLASSIFIED,
    WORKSPACE,
    Dimension,
    Ruleset,
    RunResult,
)
from .normalize import UTM_FIELDS, NormalizedUtm

# Lenses for lens_view(): the shared network view, every string through its own
# operator's lens, or one operator (by slug).
NETWORK_LENS = "network"
OWN_LENS = "own"

# The UTM field a dimension's unrecognized strings are grouped by in the review
# queue, and which the rules written there read.
REVIEW_FIELD = {"campaign": "campaign", "type": "campaign", "objective": "content", "product": "content"}

RAW_COLUMNS = tuple(f"utm_{name}" for name in UTM_FIELDS)
NORMALIZED_COLUMNS = tuple(f"n_{name}" for name in UTM_FIELDS)


# ── the two base frames ─────────────────────────────────────────────────────

def records_frame(conn: sqlite3.Connection, *, max_raw_string_id: int | None = None) -> pd.DataFrame:
    """One row per raw string: operator, raw and normalized UTM fields, spend."""
    sql = """SELECT rs.id AS raw_string_id, rs.workspace_id, w.slug AS operator_slug, w.name AS operator,
                    rs.utm_source, rs.utm_medium, rs.utm_campaign, rs.utm_content, rs.utm_term,
                    rs.activity_date, rs.spend, rs.sends, rs.batch_id, rs.source_row
               FROM raw_strings rs JOIN workspaces w ON w.id = rs.workspace_id"""
    params: tuple[int, ...] = ()
    if max_raw_string_id is not None:
        sql += " WHERE rs.id <= ?"
        params = (max_raw_string_id,)
    frame = pd.read_sql_query(sql + " ORDER BY rs.id", conn, params=params)
    normalized = [NormalizedUtm.of_fields(*fields) for fields in frame[list(RAW_COLUMNS)].itertuples(index=False)]
    for name, column in zip(UTM_FIELDS, NORMALIZED_COLUMNS, strict=True):
        frame[column] = [getattr(n, name) for n in normalized]
    frame["n_any"] = [n.full for n in normalized]
    frame["string"] = [display_string(*fields) for fields in frame[list(RAW_COLUMNS)].itertuples(index=False)]
    return frame


def display_string(*fields: str) -> str:
    """A raw string as people read it: source / medium / campaign / content / term, without empty tails."""
    parts = list(fields)
    while parts and not str(parts[-1]).strip():
        parts.pop()
    return " / ".join(str(part) for part in parts)


def outcomes_frame(result: RunResult, ruleset: Ruleset) -> pd.DataFrame:
    """One row per string, dimension and lens: status, value(s), and the rules behind them."""
    rule_keys = {rule.id: rule.rule_key for rule in ruleset.rules}
    rows = []
    for c in result.classifications:
        fired = sorted({rule_keys[h.rule_id] for h in c.hits if h.role == FIRED and h.rule_id is not None})
        candidates = sorted(
            {
                f"{ruleset.label(h.value_id) or 'ignore'} ({rule_keys.get(h.rule_id, '?')})"
                for h in c.hits
                if h.role == CANDIDATE
            }
        )
        rows.append(
            {
                "raw_string_id": c.raw_string_id,
                "dimension": c.dimension,
                "lens": c.lens,
                "status": c.status,
                "method": c.method,
                "value": " + ".join(ruleset.labels(c.value_ids)) or None,
                "rules": "lineup" if c.method == BY_LINEUP else ", ".join(fired),
                "candidates": " vs ".join(candidates),
            }
        )
    return pd.DataFrame(rows)


def allocation_frame(result: RunResult, ruleset: Ruleset) -> pd.DataFrame:
    """Each assigned value with its share of the string's spend (shares add up to 1 per outcome)."""
    rows = [
        {"raw_string_id": c.raw_string_id, "dimension": c.dimension, "lens": c.lens,
         "value": ruleset.label(value_id), "share": share}
        for c in result.classifications
        for value_id, share in c.allocation
    ]
    return pd.DataFrame(rows, columns=["raw_string_id", "dimension", "lens", "value", "share"])


def lens_view(records: pd.DataFrame, outcomes: pd.DataFrame, dimensions: Sequence[Dimension], lens: str = NETWORK_LENS) -> pd.DataFrame:
    """One outcome per string and dimension, as seen through a lens, joined to the string.

    "network" uses the shared layer only. "own" shows every string through its
    own operator's lens, and an operator slug shows only that operator's strings.
    """
    if lens == NETWORK_LENS:
        chosen = outcomes[outcomes["lens"] == NETWORK]
        strings = records
    else:
        strings = records if lens == OWN_LENS else records[records["operator_slug"] == lens]
        operator_dims = {d.key for d in dimensions if d.layer == WORKSPACE}
        own = outcomes["dimension"].isin(operator_dims)
        chosen = outcomes[(own & (outcomes["lens"] == WORKSPACE)) | (~own & (outcomes["lens"] == NETWORK))]
    return chosen.merge(strings, on="raw_string_id", how="inner")


# ── coverage ────────────────────────────────────────────────────────────────

def coverage_by_dimension(view: pd.DataFrame, dimensions: Sequence[Dimension]) -> pd.DataFrame:
    """Per dimension: the share of rows and of spend classified, and what isn't."""
    rows = []
    for dim in sorted(dimensions, key=lambda d: d.sort_order):
        part = view[view["dimension"] == dim.key]
        rows.append({"dimension": dim.key, "label": dim.label, **_tally(part)})
    return pd.DataFrame(rows).set_index("dimension")


def coverage_by_operator(view: pd.DataFrame, dimensions: Sequence[Dimension]) -> pd.DataFrame:
    """Share of each operator's spend classified, per dimension (one column per dimension label)."""
    table = {}
    for dim in sorted(dimensions, key=lambda d: d.sort_order):
        part = view[view["dimension"] == dim.key]
        spend = part.groupby("operator")["spend"].sum()
        covered = part[part["status"] == CLASSIFIED].groupby("operator")["spend"].sum()
        table[dim.label] = (covered.reindex(spend.index, fill_value=0) / spend.where(spend > 0)).fillna(0.0)
    frame = pd.DataFrame(table)
    frame.insert(0, "Spend", view[view["dimension"] == dimensions[0].key].groupby("operator")["spend"].sum())
    return frame.sort_values("Spend", ascending=False)


def _tally(part: pd.DataFrame) -> dict[str, float]:
    total_rows, total_spend = len(part), float(part["spend"].sum())
    out: dict[str, float] = {"rows": total_rows, "spend": total_spend}
    for status in (CLASSIFIED, CONFLICT, IGNORED, UNCLASSIFIED):
        hit = part[part["status"] == status]
        out[f"{status}_rows"] = len(hit)
        out[f"{status}_spend"] = float(hit["spend"].sum())
    out["rows_pct"] = out["classified_rows"] / total_rows if total_rows else 0.0
    out["spend_pct"] = out["classified_spend"] / total_spend if total_spend else 0.0
    return out


def unrecognized(view: pd.DataFrame, dimension: str, *, limit: int = 20) -> pd.DataFrame:
    """The unclassified strings with the most spend on one dimension, alike strings grouped."""
    part = view[(view["dimension"] == dimension) & (view["status"] == UNCLASSIFIED)]
    total = float(view[view["dimension"] == dimension]["spend"].sum()) or 1.0
    grouped = (
        part.groupby("n_any", sort=False)
        .agg(string=("string", "first"), operators=("operator", _names), rows=("raw_string_id", "size"), spend=("spend", "sum"))
        .sort_values("spend", ascending=False)
        .head(limit)
        .reset_index(drop=True)
    )
    grouped.insert(0, "rank", range(1, len(grouped) + 1))
    grouped["share"] = grouped["spend"] / total
    return grouped


def conflicts(view: pd.DataFrame) -> pd.DataFrame:
    """Every conflicted string, by dimension: what the tied rules said."""
    part = view[view["status"] == CONFLICT]
    return (
        part.groupby(["dimension", "n_any"], sort=False)
        .agg(string=("string", "first"), candidates=("candidates", "first"), operators=("operator", _names),
             rows=("raw_string_id", "size"), spend=("spend", "sum"))
        .sort_values("spend", ascending=False)
        .reset_index()
        .drop(columns="n_any")
    )


def _names(series: pd.Series) -> str:
    return ", ".join(sorted(set(series)))


# ── the review queue ────────────────────────────────────────────────────────

def review_queue(
    view: pd.DataFrame, dimension: str, field: str, *, statuses: Sequence[str] = (UNCLASSIFIED, CONFLICT)
) -> pd.DataFrame:
    """Unclassified and conflicted strings on one dimension, grouped by one field's value, biggest spend first.

    Strings that share the field's value are one decision: a rule on that field
    settles all of them, for this import and every later one.
    """
    key = f"n_{field}" if field != "any" else "n_any"
    raw = f"utm_{field}" if field != "any" else "string"
    part = view[(view["dimension"] == dimension) & view["status"].isin(statuses)]
    total = float(view[view["dimension"] == dimension]["spend"].sum()) or 1.0
    if part.empty:
        return pd.DataFrame(columns=["rank", "key", "example", "status", "candidates", "operators", "rows",
                                     "strings", "spend", "share", "samples"])
    queue = (
        part.groupby(key, sort=False)
        .agg(
            example=(raw, _most_common),
            status=("status", lambda s: CONFLICT if (s == CONFLICT).any() else UNCLASSIFIED),
            candidates=("candidates", lambda s: next((c for c in s if c), "")),
            operators=("operator", _names),
            rows=("raw_string_id", "size"),
            strings=("n_any", "nunique"),
            spend=("spend", "sum"),
            samples=("string", lambda s: list(dict.fromkeys(s))[:3]),
        )
        .sort_values(["spend", "rows"], ascending=False)
        .reset_index()
        .rename(columns={key: "key"})
    )
    queue["share"] = queue["spend"] / total
    queue.insert(0, "rank", range(1, len(queue) + 1))
    return queue


def _most_common(series: pd.Series) -> str:
    return str(series.value_counts().index[0])


def classified_examples(view: pd.DataFrame, dimension: str, field: str) -> dict[str, str]:
    """Field values already classified on a dimension, each with its (most common) single value."""
    key = f"n_{field}" if field != "any" else "n_any"
    part = view[(view["dimension"] == dimension) & (view["status"] == CLASSIFIED) & view["value"].notna()]
    part = part[~part["value"].str.contains(" + ", regex=False)]   # single values only
    if part.empty:
        return {}
    counts = part.groupby([key, "value"]).size().reset_index(name="n").sort_values("n", ascending=False)
    return dict(counts.drop_duplicates(key)[[key, "value"]].itertuples(index=False, name=None))


def rule_reach(
    records: pd.DataFrame, view: pd.DataFrame, dimension: str, *, field: str, match_type: str, pattern: str
) -> tuple[dict[str, float], pd.DataFrame]:
    """What a pattern would match, before precedence: "test this rule".

    Returns totals (rows, spend, and how much of it isn't classified yet on the
    dimension) and the matching strings with their current outcome.
    """
    matches = compile_pattern(match_type, pattern)
    column = f"n_{field}" if field != "any" else "n_any"
    hit = records[[bool(matches(text)) for text in records[column]]]
    current = view[view["dimension"] == dimension][["raw_string_id", "status", "value"]]
    hit = hit.merge(current, on="raw_string_id", how="left")
    open_ = hit[hit["status"] != CLASSIFIED]
    totals = {
        "rows": len(hit),
        "spend": float(hit["spend"].sum()),
        "open_rows": len(open_),
        "open_spend": float(open_["spend"].sum()),
        "strings": int(hit["n_any"].nunique()),
    }
    sample = (
        hit.groupby("n_any", sort=False)
        .agg(string=("string", "first"), operators=("operator", _names), rows=("raw_string_id", "size"),
             spend=("spend", "sum"), now=("value", "first"), status=("status", "first"))
        .sort_values("spend", ascending=False)
        .reset_index(drop=True)
    )
    sample["now"] = sample["now"].fillna("")
    return totals, sample


# ── exports ─────────────────────────────────────────────────────────────────

def mapping_table(
    records: pd.DataFrame, outcomes: pd.DataFrame, dimensions: Sequence[Dimension], *, version_id: int, engine_version: str
) -> pd.DataFrame:
    """One row per raw string: the string as imported, each dimension's value and the rule that set it.

    Shared dimensions come from the network lens. Operator-level dimensions get
    two columns: the network value, and the value in the string's own operator lens.
    """
    out = records[["raw_string_id", "source_row", "operator", *RAW_COLUMNS, "activity_date", "spend", "sends"]].copy()
    out = out.rename(columns={"source_row": "row_id"})
    for dim in sorted(dimensions, key=lambda d: d.sort_order):
        lenses = [(NETWORK, dim.key)]
        if dim.layer == WORKSPACE:
            lenses.append((WORKSPACE, f"{dim.key}_operator_lens"))
        for lens, column in lenses:
            part = outcomes[(outcomes["dimension"] == dim.key) & (outcomes["lens"] == lens)]
            cell = part["value"].where(part["status"] == CLASSIFIED, "[" + part["status"] + "]")
            values = pd.DataFrame({"raw_string_id": part["raw_string_id"], column: cell, f"{column}_rule": part["rules"]})
            out = out.merge(values, on="raw_string_id", how="left")
    out["ruleset_version"] = version_id
    out["engine_version"] = engine_version
    return out.drop(columns="raw_string_id")


def campaign_rollup(view: pd.DataFrame, ruleset: Ruleset, campaigns: pd.DataFrame) -> pd.DataFrame:
    """Spend by campaign in the network lens, with dates, owner and the network product lineup.

    Strings without a campaign appear as (unclassified), (conflict) or (ignored),
    so the total always equals the data's total spend.
    """
    part = view[view["dimension"] == "campaign"].copy()
    part["campaign"] = part["value"].where(part["status"] == CLASSIFIED, "(" + part["status"] + ")")
    total = float(part["spend"].sum()) or 1.0
    rollup = (
        part.groupby("campaign")
        .agg(spend=("spend", "sum"), rows=("raw_string_id", "size"), strings=("n_any", "nunique"),
             operators=("operator", "nunique"))
        .reset_index()
    )
    rollup["share"] = rollup["spend"] / total
    lineups = _network_lineups(ruleset)
    info = campaigns.rename(columns={"name": "campaign", "workspace": "local_to"})[["campaign", "start_date", "end_date", "local_to"]]
    rollup = rollup.merge(info, on="campaign", how="left")
    rollup["network_products"] = rollup["campaign"].map(lineups).fillna("")
    for column in ("start_date", "end_date", "local_to"):
        rollup[column] = rollup[column].fillna("")
    rollup["bucket"] = rollup["campaign"].str.startswith("(")
    rollup = rollup.sort_values(["bucket", "spend"], ascending=[True, False]).drop(columns="bucket").reset_index(drop=True)
    return rollup[["campaign", "start_date", "end_date", "local_to", "spend", "share", "rows", "strings",
                   "operators", "network_products"]]


def _network_lineups(ruleset: Ruleset) -> dict[str, str]:
    by_campaign: dict[int, list[tuple[str, float]]] = {}
    for row in ruleset.campaign_products:
        if row.workspace_id is None:
            by_campaign.setdefault(row.campaign_value_id, []).append((ruleset.label(row.product_value_id), row.weight))
    out = {}
    for campaign_id, products in by_campaign.items():
        total = sum(weight for _, weight in products)
        out[ruleset.label(campaign_id)] = ", ".join(f"{name} {weight / total:.0%}" for name, weight in products)
    return out


def excel_bytes(sheets: dict[str, pd.DataFrame]) -> bytes:
    """An Excel workbook with one sheet per frame, columns sized to fit."""
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        for name, frame in sheets.items():
            frame.to_excel(writer, sheet_name=name[:31], index=False)
            sheet = writer.sheets[name[:31]]
            for index, column in enumerate(frame.columns, start=1):
                width = max([len(str(column))] + [len(str(text)) for text in frame[column].head(200)])
                sheet.column_dimensions[sheet.cell(row=1, column=index).column_letter].width = min(max(10, width + 2), 60)
            sheet.freeze_panes = "A2"
    return buffer.getvalue()
