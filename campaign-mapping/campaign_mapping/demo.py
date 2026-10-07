"""Build the demo database: the Zestify taxonomy, the synthetic strings and the starter ruleset.

    python -m campaign_mapping.demo             # (re)build data/demo.db

The app calls ensure_demo_db() on start, so a fresh host (such as Streamlit
Community Cloud, whose disk doesn't survive a restart) rebuilds the same
database from the files in data/. The ground truth file is never loaded.
"""

from __future__ import annotations

import csv
import os
import sqlite3
from pathlib import Path

from .db import connect, init_db
from .rulesets import change_ruleset
from .runs import import_rows, run_classification
from .seed import seed_taxonomy

PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
DEMO_DB = DATA_DIR / "demo.db"
STRINGS_CSV = DATA_DIR / "utm_strings.csv"
STARTER_RULES_CSV = DATA_DIR / "starter_rules.csv"
DEMO_AUTHOR = "demo-setup"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def load_rules_csv(conn: sqlite3.Connection, path: Path, *, author: str, message: str) -> int | None:
    """Add every rule in a CSV (the columns of a rule) as one new ruleset version."""
    with change_ruleset(conn, author=author, message=message) as change:
        for row in read_csv(path):
            change.add_rule(
                dimension=row["dimension"],
                field=row["field"],
                match_type=row["match_type"],
                pattern=row["pattern"],
                value=row["value"] or None,
                priority=int(row["priority"]),
                workspace=row["workspace"] or None,
                action=row["action"] or "assign",
                owner=row["owner"] or author,
                note=row["note"],
            )
    return change.version_id


def build_demo_db(path: Path = DEMO_DB) -> Path:
    """Build a fresh demo database at `path`, replacing any database already there."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f".{path.name}.{os.getpid()}.building")
    partial.unlink(missing_ok=True)
    conn = connect(partial)
    try:
        init_db(conn)
        seed_taxonomy(conn, author=DEMO_AUTHOR)
        rows = [{**row, "source_row": row.pop("row_id")} for row in read_csv(STRINGS_CSV)]
        import_rows(conn, rows, source_name=STRINGS_CSV.name, imported_by=DEMO_AUTHOR,
                    note="Synthetic Zestify data from scripts/generate_data.py")
        load_rules_csv(conn, STARTER_RULES_CSV, author=DEMO_AUTHOR,
                       message="Starter ruleset: the obvious patterns, before any review")
        run_classification(conn, created_by=DEMO_AUTHOR, note="Starter run")
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()
    for suffix in ("-wal", "-shm"):
        Path(f"{path}{suffix}").unlink(missing_ok=True)
    os.replace(partial, path)   # appears whole, or not at all
    for suffix in ("-wal", "-shm"):
        Path(f"{partial}{suffix}").unlink(missing_ok=True)
    return path


def ensure_demo_db(path: Path = DEMO_DB) -> Path:
    """The demo database, built first if it doesn't exist yet."""
    path = Path(path)
    if not path.exists():
        build_demo_db(path)
    return path


if __name__ == "__main__":
    print(f"Built {build_demo_db()}")
