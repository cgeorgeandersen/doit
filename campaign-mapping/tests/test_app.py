"""The Streamlit app, driven headless with Streamlit's own test harness."""

import os
import shutil
import sys
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from campaign_mapping.db import connect
from campaign_mapping.rulesets import current_version_id, load_ruleset

HOME = str(Path(__file__).resolve().parents[1] / "app" / "Home.py")
PAGES = ["overview", "review", "coverage", "rules", "import_data", "versions", "export"]


@pytest.fixture(scope="module")
def db_path(demo_db, tmp_path_factory):
    """One working copy for this module. The app reads its path once, when `common` is first imported."""
    path = tmp_path_factory.mktemp("app") / "demo.db"
    shutil.copy(demo_db, path)
    os.environ["CAMPAIGN_MAPPING_DB"] = str(path)
    sys.modules.pop("common", None)
    yield path
    os.environ.pop("CAMPAIGN_MAPPING_DB", None)


def open_page(page: str) -> AppTest:
    app = AppTest.from_file(HOME, default_timeout=120)
    app.run()
    app.switch_page(f"views/{page}.py")
    app.run()
    return app


@pytest.mark.parametrize("page", PAGES)
def test_every_page_renders_without_errors(db_path, page):
    app = open_page(page)
    assert not app.exception, [e.value for e in app.exception]
    assert not app.error, [e.value for e in app.error]
    assert app.title


def test_accepting_a_review_suggestion_writes_a_rule_and_a_version(db_path):
    before = current_version_id(connect(db_path))
    app = open_page("review")
    [button] = [b for b in app.button if b.key and b.key.startswith("go-")][:1]
    button.click().run()
    assert not app.exception
    conn = connect(db_path)
    assert current_version_id(conn) == before + 1
    newest = max(load_ruleset(conn).rules, key=lambda r: r.id)
    assert (newest.match_type, newest.pattern, newest.priority) == ("exact", "sc-26", 10)
    assert "Version" in app.success[0].value


def test_adding_a_rule_from_the_rules_page(db_path):
    before = current_version_id(connect(db_path))
    app = open_page("rules")
    app.text_input(key="add-pattern").input("fk26").run()
    app.selectbox(key="add-value").select("Fall Kickoff 2026").run()
    assert not app.exception and not app.error
    [add] = [b for b in app.button if b.label == "Add rule"]
    add.click().run()
    conn = connect(db_path)
    assert current_version_id(conn) == before + 1
    assert any(r.pattern == "fk26" for r in load_ruleset(conn).rules)


def test_a_recorded_run_reproduces_from_the_versions_page(db_path):
    app = open_page("versions")
    [button] = [b for b in app.button if b.label == "Reproduce it"]
    button.click().run()
    assert "reproduces exactly" in app.success[0].value
