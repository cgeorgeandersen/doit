"""SQLite plumbing: open a connection, create the schema, run a write transaction.

The data model lives in schema.sql next to this file. Connections run in
autocommit mode and every write goes through transaction(), so a change
either lands whole or not at all.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")
ROOT_VERSION_MESSAGE = "Empty ruleset: every string starts unclassified"


def connect(path: str | Path = ":memory:", *, check_same_thread: bool = True) -> sqlite3.Connection:
    """Open a database with foreign keys enforced and rows readable by column name."""
    conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=check_same_thread)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if str(path) != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create whatever is missing, and the empty root ruleset version every history starts from."""
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    with transaction(conn):
        if conn.execute("SELECT 1 FROM ruleset_versions LIMIT 1").fetchone() is None:
            conn.execute(
                "INSERT INTO ruleset_versions (id, parent_id, message, author, created_at)"
                " VALUES (1, NULL, ?, 'system', ?)",
                (ROOT_VERSION_MESSAGE, utc_now()),
            )


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Run the block in one write transaction, or inside the caller's if one is already open."""
    if conn.in_transaction:
        yield conn
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
