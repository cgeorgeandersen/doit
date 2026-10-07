"""Raw strings in, classification runs out, and any past run reproduced.

A run is stored with its ruleset version, the engine version and an input
watermark: the highest raw_strings.id it read. raw_strings is append-only, so
"every id up to the watermark" names the same rows forever, and re-running
the same version over them must reproduce the run's fingerprint exactly. If
it doesn't, something that is supposed to be immutable has changed.
"""

from __future__ import annotations

import hashlib
import math
import sqlite3
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime

from . import taxonomy
from .db import transaction, utc_now
from .engine import ENGINE_VERSION, audit_result, classify, input_fingerprint
from .models import Classification, Hit, Ruleset, RunResult, UtmRecord, sort_hits
from .rulesets import load_ruleset

UTM_COLUMNS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


@dataclass(frozen=True)
class ImportResult:
    batch_id: int
    rows: int


@dataclass(frozen=True)
class RunInfo:
    id: int
    version_id: int
    engine_version: str
    max_raw_string_id: int
    input_count: int
    input_fingerprint: str
    result_fingerprint: str
    note: str
    created_by: str
    created_at: str


@dataclass(frozen=True)
class Reproduction:
    run_id: int
    version_id: int
    stored_fingerprint: str
    reproduced_fingerprint: str
    inputs_match: bool          # the raw strings up to the watermark are still the ones the run read
    engine_version_then: str
    engine_version_now: str

    @property
    def matches(self) -> bool:
        return self.inputs_match and self.stored_fingerprint == self.reproduced_fingerprint


# ── raw strings ─────────────────────────────────────────────────────────────

def import_rows(
    conn: sqlite3.Connection,
    rows: Iterable[Mapping[str, object]],
    *,
    source_name: str,
    imported_by: str,
    note: str = "",
) -> ImportResult:
    """Store rows exactly as they arrived, as one import batch.

    Each row needs an `operator` (id, slug or name) and may have the five
    `utm_*` fields, `spend`, `sends`, `activity_date` (YYYY-MM-DD) and
    `source_row`. UTM values are stored verbatim, so "  FB " stays "  FB ";
    a missing one is stored as empty text. Either every row is stored or none is.
    """
    operators: dict[object, int] = {}
    prepared = []
    for number, row in enumerate(rows, start=1):
        source_row = number if _is_blank(row.get("source_row")) else int(row["source_row"])
        where = f"Row {source_row}"
        operator_name = row.get("operator")
        if _is_blank(operator_name) or not str(operator_name).strip():
            raise ValueError(f"{where}: no operator")
        if operator_name not in operators:
            operators[operator_name] = taxonomy.workspace_id(conn, operator_name)
        workspace_id = operators[operator_name]
        utm = tuple("" if _is_blank(row.get(column)) else str(row.get(column)) for column in UTM_COLUMNS)
        activity_date = _iso_date(row.get("activity_date"), where)
        spend = _spend(row.get("spend"), where)
        sends = _count(row.get("sends"), where)
        row_hash = _row_hash(workspace_id, utm, activity_date, spend, sends)
        prepared.append((source_row, workspace_id, *utm, activity_date, spend, sends, row_hash))

    with transaction(conn):
        batch_id = conn.execute(
            "INSERT INTO import_batches (source_name, row_count, note, imported_by, imported_at) VALUES (?, ?, ?, ?, ?)",
            (source_name, len(prepared), note, imported_by, utc_now()),
        ).lastrowid
        conn.executemany(
            """INSERT INTO raw_strings (batch_id, source_row, workspace_id, utm_source, utm_medium, utm_campaign,
                                        utm_content, utm_term, activity_date, spend, sends, row_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [(batch_id, *row) for row in prepared],
        )
    return ImportResult(batch_id, len(prepared))


def load_records(conn: sqlite3.Connection, *, max_raw_string_id: int | None = None) -> list[UtmRecord]:
    """Raw strings as the engine reads them, oldest first; all of them, or those up to a watermark."""
    sql = "SELECT id, workspace_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM raw_strings"
    params: tuple[int, ...] = ()
    if max_raw_string_id is not None:
        sql += " WHERE id <= ?"
        params = (max_raw_string_id,)
    return [UtmRecord(*row) for row in conn.execute(sql + " ORDER BY id", params)]


# ── runs ────────────────────────────────────────────────────────────────────

def run_classification(
    conn: sqlite3.Connection, *, created_by: str, version_id: int | None = None, note: str = ""
) -> tuple[int, RunResult]:
    """Classify every raw string with a ruleset version (the current one by default) and store the run."""
    ruleset = load_ruleset(conn, version_id)
    with transaction(conn):
        (watermark,) = conn.execute("SELECT COALESCE(MAX(id), 0) FROM raw_strings").fetchone()
        records = load_records(conn, max_raw_string_id=watermark)
        result = classify(records, ruleset)
        problems = audit_result(result, ruleset)
        if problems:
            raise RuntimeError(
                "Refusing to store a run that breaks the engine's promises:\n" + "\n".join(problems[:20])
            )
        run_id = conn.execute(
            """INSERT INTO classification_runs (version_id, engine_version, max_raw_string_id, input_count,
                                                input_fingerprint, result_fingerprint, note, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                ruleset.version_id,
                result.engine_version,
                watermark,
                len(records),
                input_fingerprint(records),
                result.fingerprint(),
                note,
                created_by,
                utc_now(),
            ),
        ).lastrowid
        _store_classifications(conn, run_id, ruleset, result)
    return run_id, result


def _store_classifications(conn: sqlite3.Connection, run_id: int, ruleset: Ruleset, result: RunResult) -> None:
    dimension_ids = {d.key: d.id for d in ruleset.dimensions}
    # Ids are assigned here so hits can be written in bulk; safe because the
    # caller holds the write lock for the whole run.
    (next_id,) = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM classifications").fetchone()
    outcomes, hits = [], []
    for offset, c in enumerate(result.classifications):
        classification_id = next_id + offset
        outcomes.append(
            (classification_id, run_id, c.raw_string_id, dimension_ids[c.dimension], c.lens, c.status, c.method)
        )
        hits.extend(
            (classification_id, h.role, h.value_id, h.rule_id, h.campaign_product_id, h.weight) for h in c.hits
        )
    conn.executemany(
        "INSERT INTO classifications (id, run_id, raw_string_id, dimension_id, lens, status, method)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        outcomes,
    )
    conn.executemany(
        "INSERT INTO classification_hits (classification_id, role, value_id, rule_id, campaign_product_id, weight)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        hits,
    )


def load_run(conn: sqlite3.Connection, run_id: int) -> RunInfo:
    row = conn.execute("SELECT * FROM classification_runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise LookupError(f"There is no classification run {run_id}")
    return RunInfo(**dict(row))


def list_runs(conn: sqlite3.Connection) -> list[RunInfo]:
    return [RunInfo(**dict(row)) for row in conn.execute("SELECT * FROM classification_runs ORDER BY id")]


def load_run_result(conn: sqlite3.Connection, run_id: int) -> RunResult:
    """A stored run, rebuilt from the database exactly as the engine returned it."""
    run = load_run(conn, run_id)
    hits: dict[int, list[Hit]] = {}
    for row in conn.execute(
        """SELECT h.classification_id, h.role, h.value_id, h.rule_id, h.campaign_product_id, h.weight
             FROM classification_hits h JOIN classifications c ON c.id = h.classification_id
            WHERE c.run_id = ? ORDER BY h.id""",
        (run_id,),
    ):
        hits.setdefault(row[0], []).append(Hit(*row[1:]))
    outcomes = conn.execute(
        """SELECT c.id, c.raw_string_id, d.key, c.lens, c.status, c.method
             FROM classifications c JOIN dimensions d ON d.id = c.dimension_id
            WHERE c.run_id = ? ORDER BY c.id""",
        (run_id,),
    )
    classifications = tuple(
        Classification(raw_string_id, dimension, lens, status, method, sort_hits(hits.get(classification_id, ())))
        for classification_id, raw_string_id, dimension, lens, status, method in outcomes
    )
    return RunResult(run.version_id, run.engine_version, classifications)


def reproduce_run(conn: sqlite3.Connection, run_id: int) -> Reproduction:
    """Re-classify a past run's exact input with its exact ruleset version, and compare fingerprints."""
    run = load_run(conn, run_id)
    records = load_records(conn, max_raw_string_id=run.max_raw_string_id)
    result = classify(records, load_ruleset(conn, run.version_id))
    return Reproduction(
        run_id=run.id,
        version_id=run.version_id,
        stored_fingerprint=run.result_fingerprint,
        reproduced_fingerprint=result.fingerprint(),
        inputs_match=input_fingerprint(records) == run.input_fingerprint,
        engine_version_then=run.engine_version,
        engine_version_now=ENGINE_VERSION,
    )


# ── import helpers ──────────────────────────────────────────────────────────

def _is_blank(value: object) -> bool:
    if value is None:
        return True
    try:
        return bool(value != value)   # NaN and NaT are the only values unequal to themselves
    except TypeError:
        return True                   # pandas' NA refuses to compare: it is missing


def _spend(value: object, where: str) -> float:
    if _is_blank(value) or (isinstance(value, str) and not value.strip()):
        return 0.0
    try:
        amount = float(str(value).strip().replace(",", "").replace("$", ""))
    except ValueError:
        raise ValueError(f"{where}: spend {value!r} is not a number") from None
    if not math.isfinite(amount) or amount < 0:
        raise ValueError(f"{where}: spend must be zero or more, got {value!r}")
    return amount


def _count(value: object, where: str) -> int | None:
    if _is_blank(value) or (isinstance(value, str) and not value.strip()):
        return None
    try:
        number = float(str(value).strip().replace(",", ""))
    except ValueError:
        raise ValueError(f"{where}: sends {value!r} is not a number") from None
    if not number.is_integer() or number < 0:
        raise ValueError(f"{where}: sends must be a whole number, zero or more, got {value!r}")
    return int(number)


def _iso_date(value: object, where: str) -> str | None:
    if _is_blank(value) or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        raise ValueError(f"{where}: activity_date {value!r} is not a YYYY-MM-DD date") from None


def _row_hash(
    workspace_id: int, utm: tuple[str, ...], activity_date: str | None, spend: float, sends: int | None
) -> str:
    parts = (str(workspace_id), *utm, activity_date or "", repr(spend), "" if sends is None else str(sends))
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()
