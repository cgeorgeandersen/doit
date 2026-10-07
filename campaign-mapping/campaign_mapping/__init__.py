"""Campaign mapping layer: classify messy UTM strings with a versioned rule table.

Pure modules, with no database or files, safe to reuse behind an API:
normalize, matching, models, engine, diff. SQLite modules: db, taxonomy,
rulesets, runs, seed. Nothing in this package imports Streamlit;
tests/test_architecture.py keeps it that way.
"""

from .engine import ENGINE_VERSION

__all__ = ["ENGINE_VERSION"]
