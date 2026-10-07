import sqlite3

import pytest

from campaign_mapping.diff import ADDED, CHANGED, REMOVED
from campaign_mapping.engine import ENGINE_VERSION
from campaign_mapping.matching import InvalidRule
from campaign_mapping.models import NETWORK, UNCLASSIFIED, WORKSPACE
from campaign_mapping.rulesets import (
    change_ruleset,
    current_version_id,
    diff_versions,
    list_versions,
    load_ruleset,
    revert_to_version,
)
from campaign_mapping.runs import import_rows, load_run, load_run_result, reproduce_run, run_classification

ROWS = [
    {"operator": "northgate", "utm_source": "FB", "utm_medium": "paid_social", "utm_campaign": "SC26_Launch", "spend": 1200},
    {"operator": "pinecrest", "utm_source": "facebook", "utm_campaign": "Summer%20Cup", "spend": 300},
    {"operator": "sunvale", "utm_source": "email", "utm_campaign": "order_receipt", "spend": 1},
    {"operator": "redrock", "utm_source": "google", "utm_campaign": "summercup-26", "spend": 900},
]


def add_rule(conn, message="Add a rule", **spec):
    spec.setdefault("dimension", "campaign")
    spec.setdefault("field", "campaign")
    spec.setdefault("value", "Summer Cup 2026")
    with change_ruleset(conn, author="tester", message=message) as change:
        rule = change.add_rule(**spec)
    return change.version_id, rule


def edit(conn, rule_key, **changes):
    with change_ruleset(conn, author="tester", message=f"Edit {rule_key}") as change:
        rule = change.edit_rule(rule_key, **changes)
    return change.version_id, rule


def rule_in(conn, version_id, rule_key):
    return next(rule for rule in load_ruleset(conn, version_id).rules if rule.rule_key == rule_key)


def summer_cup_version(conn):
    version, _ = add_rule(conn, pattern=r"summer[\s_-]*cup|sc26", match_type="regex")
    return version


def count(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


# ── every change is a version ───────────────────────────────────────────────

def test_every_change_creates_a_new_version(seeded):
    start = current_version_id(seeded)
    v1, rule = add_rule(seeded, pattern="summer cup")
    v2, _ = edit(seeded, rule.rule_key, priority=50)
    with change_ruleset(seeded, author="tester", message="Retire it") as change:
        change.deactivate_rule(rule.rule_key)
    v3 = change.version_id
    assert (v1, v2, v3) == (start + 1, start + 2, start + 3)
    assert [v.parent_id for v in list_versions(seeded)[-3:]] == [start, v1, v2]
    # Each version still says exactly what it said when it was made.
    assert [rule_in(seeded, v, rule.rule_key).priority for v in (v1, v2, v3)] == [100, 50, 50]
    assert [rule_in(seeded, v, rule.rule_key).active for v in (v1, v2, v3)] == [True, True, False]
    assert [rule_in(seeded, v, rule.rule_key).revision for v in (v1, v2, v3)] == [1, 2, 3]


def test_a_changeset_is_one_version(seeded):
    start = current_version_id(seeded)
    with change_ruleset(seeded, author="tester", message="Summer Cup patterns") as change:
        change.add_rule(dimension="campaign", field="campaign", pattern="summer cup", value="Summer Cup 2026")
        change.add_rule(dimension="campaign", field="campaign", pattern="sc26", value="Summer Cup 2026")
        change.add_rule(dimension="type", field="campaign", pattern="receipt", value="Transactional")
    assert change.version_id == start + 1 == current_version_id(seeded)
    assert [rule.rule_key for rule in load_ruleset(seeded).rules] == ["R0001", "R0002", "R0003"]


def test_a_change_that_changes_nothing_makes_no_version(seeded):
    _, rule = add_rule(seeded, pattern="summer cup")
    start = current_version_id(seeded)
    with change_ruleset(seeded, author="tester", message="Nothing at all") as change:
        pass
    assert change.version_id is None
    assert edit(seeded, rule.rule_key, priority=100)[0] is None   # it was already 100
    with change_ruleset(seeded, author="tester", message="There and back") as change:
        change.edit_rule(rule.rule_key, priority=5)
        change.edit_rule(rule.rule_key, priority=100)
        change.set_lineup("Summer Cup 2026", {"Zestify Zero": 2}, workspace="pinecrest")
        change.set_lineup("Summer Cup 2026", {"Zestify Zero": 1}, workspace="pinecrest")
    assert change.version_id is None
    assert current_version_id(seeded) == start
    assert count(seeded, "rules") == 1   # the round trip left no stray revisions


def test_editing_a_rule_twice_in_one_change_keeps_the_last_edit(seeded):
    _, rule = add_rule(seeded, pattern="summer cup")
    with change_ruleset(seeded, author="tester", message="Two passes") as change:
        change.edit_rule(rule.rule_key, priority=5)
        change.edit_rule(rule.rule_key, priority=7)
    assert rule_in(seeded, change.version_id, rule.rule_key).priority == 7
    later, edited = edit(seeded, rule.rule_key, priority=9)   # revision numbers never collide
    assert later is not None and edited.revision > 2


def test_a_failed_change_leaves_no_trace(seeded):
    start = current_version_id(seeded)
    with pytest.raises(RuntimeError):
        with change_ruleset(seeded, author="tester", message="Doomed") as change:
            change.add_rule(dimension="campaign", field="campaign", pattern="summer", value="Summer Cup 2026")
            raise RuntimeError("the reviewer changed their mind")
    assert current_version_id(seeded) == start
    assert count(seeded, "rules") == 0


def test_a_change_needs_an_author_and_a_reason(seeded):
    with pytest.raises(ValueError, match="message"):
        with change_ruleset(seeded, author="tester", message="  "):
            pass
    with pytest.raises(ValueError, match="author"):
        with change_ruleset(seeded, author="", message="Why"):
            pass


@pytest.mark.parametrize(
    "spec, error",
    [
        ({"value": "Zestify Lime"}, LookupError),          # a product value on a campaign rule
        ({"value": "Summer Cup 2099"}, LookupError),       # not a controlled value
        ({"value": None}, ValueError),                     # an assign rule needs a value
        ({"action": "ignore"}, ValueError),                # an ignore rule takes no value
        ({"pattern": "summer(cup", "match_type": "regex"}, InvalidRule),
        ({"pattern": ".*", "match_type": "regex"}, InvalidRule),   # a catch-all
        ({"pattern": "   "}, ValueError),
        ({"field": "utm_campaign"}, ValueError),
        ({"match_type": "fuzzy"}, ValueError),
        ({"priority": -1}, ValueError),
        ({"priority": True}, ValueError),
        ({"priority": 1.5}, ValueError),
        ({"workspace": "northgate"}, ValueError),          # campaign is a shared network fact
        ({"dimension": "channel"}, ValueError),            # not a dimension (that's an admin's call)
    ],
)
def test_invalid_rules_are_refused(seeded, spec, error):
    with pytest.raises(error):
        add_rule(seeded, **{"pattern": "summer", **spec})
    assert count(seeded, "rules") == 0


def test_an_operator_may_keep_its_own_product_rules(seeded):
    _, rule = add_rule(seeded, dimension="product", value="Zestify Lime", pattern="summer", workspace="Northgate Beverage")
    assert rule.workspace_id is not None


def test_a_rule_keeps_its_dimension(seeded):
    _, rule = add_rule(seeded, pattern="summer")
    with pytest.raises(ValueError, match="dimension"):
        edit(seeded, rule.rule_key, dimension="type")


def test_turning_a_rule_into_an_ignore_rule_drops_its_value(seeded):
    _, rule = add_rule(seeded, pattern="test")
    _, ignored = edit(seeded, rule.rule_key, action="ignore")
    assert (ignored.action, ignored.value_id, ignored.revision) == ("ignore", None, 2)


# ── history can't be rewritten ──────────────────────────────────────────────

@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE rules SET priority = 1",
        "DELETE FROM rules",
        "UPDATE ruleset_versions SET message = 'rewritten'",
        "DELETE FROM ruleset_versions WHERE id = 1",
        "DELETE FROM ruleset_version_rules",
        "UPDATE campaign_products SET weight = 9",
        "DELETE FROM ruleset_version_campaign_products",
    ],
)
def test_history_cannot_be_rewritten(seeded, statement):
    add_rule(seeded, pattern="summer")
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute(statement)


def test_stored_results_cannot_be_edited(seeded):
    import_rows(seeded, ROWS, source_name="q2.csv", imported_by="tester")
    summer_cup_version(seeded)
    run_classification(seeded, created_by="tester")
    for statement in [
        "UPDATE classifications SET status = 'classified'",
        "UPDATE classification_hits SET weight = 1",
        "UPDATE classification_runs SET version_id = 1",
    ]:
        with pytest.raises(sqlite3.IntegrityError):
            seeded.execute(statement)


# ── reproducibility ─────────────────────────────────────────────────────────

def test_a_past_run_reproduces_exactly_after_the_rules_change(seeded):
    import_rows(seeded, ROWS, source_name="q2.csv", imported_by="tester")
    old_version = summer_cup_version(seeded)
    old_run, old_result = run_classification(seeded, created_by="tester")

    # The rules move on: the pattern is narrowed and a new rule appears.
    edit(seeded, "R0001", pattern="sc26", match_type="contains")
    add_rule(seeded, pattern="receipt", value="Non-campaign")
    _, new_result = run_classification(seeded, created_by="tester")
    assert new_result.fingerprint() != old_result.fingerprint()

    reproduction = reproduce_run(seeded, old_run)
    assert reproduction.matches
    assert reproduction.version_id == old_version
    assert reproduction.engine_version_then == reproduction.engine_version_now == ENGINE_VERSION
    assert load_run_result(seeded, old_run) == old_result   # stored exactly as computed
    assert load_run_result(seeded, old_run).fingerprint() == load_run(seeded, old_run).result_fingerprint


def test_reproduction_reads_only_the_strings_the_run_saw(seeded):
    import_rows(seeded, ROWS[:2], source_name="june.csv", imported_by="tester")
    summer_cup_version(seeded)
    run_id, _ = run_classification(seeded, created_by="tester")
    import_rows(seeded, ROWS[2:], source_name="july.csv", imported_by="tester")
    reproduction = reproduce_run(seeded, run_id)
    assert reproduction.matches and reproduction.inputs_match
    assert load_run(seeded, run_id).input_count == 2


def test_a_run_records_its_version_and_engine(seeded):
    import_rows(seeded, ROWS, source_name="q2.csv", imported_by="tester")
    version = summer_cup_version(seeded)
    baseline, _ = run_classification(seeded, created_by="tester", version_id=1)   # the empty root version
    run = load_run(seeded, baseline)
    assert (run.version_id, run.engine_version) == (1, ENGINE_VERSION)
    assert {c.status for c in load_run_result(seeded, baseline).classifications} == {UNCLASSIFIED}
    latest, _ = run_classification(seeded, created_by="tester")
    assert load_run(seeded, latest).version_id == version


def test_the_view_names_the_value_the_fired_rule_and_the_version(seeded):
    import_rows(seeded, ROWS, source_name="q2.csv", imported_by="tester")
    version = summer_cup_version(seeded)
    run_id, _ = run_classification(seeded, created_by="tester")
    rows = seeded.execute(
        "SELECT raw_string_id, status, value, rule_key, version_id FROM v_classifications"
        " WHERE run_id = ? AND dimension = 'campaign' ORDER BY raw_string_id",
        (run_id,),
    ).fetchall()
    assert [tuple(row) for row in rows] == [
        (1, "classified", "Summer Cup 2026", "R0001", version),
        (2, "classified", "Summer Cup 2026", "R0001", version),
        (3, "unclassified", None, None, version),
        (4, "classified", "Summer Cup 2026", "R0001", version),
    ]


# ── lineups are versioned like rules ────────────────────────────────────────

def test_a_lineup_change_is_a_version_and_old_versions_keep_the_old_lineup(seeded):
    import_rows(seeded, ROWS[:1], source_name="june.csv", imported_by="tester")   # a Northgate row
    before = summer_cup_version(seeded)
    with change_ruleset(seeded, author="tester", message="Northgate moves Summer Cup to Zero") as change:
        change.set_lineup("Summer Cup 2026", {"Zestify Zero": 1}, workspace="northgate")
    _, old = run_classification(seeded, created_by="tester", version_id=before)
    _, new = run_classification(seeded, created_by="tester", version_id=change.version_id)
    ruleset = load_ruleset(seeded)
    assert ruleset.labels(old.get(1, "product", WORKSPACE).value_ids) == ["Zestify Original", "Zestify Lime"]
    assert ruleset.labels(new.get(1, "product", WORKSPACE).value_ids) == ["Zestify Zero"]
    assert old.get(1, "product", NETWORK) == new.get(1, "product", NETWORK)   # the network lens never moved


# ── diffs and reverts ───────────────────────────────────────────────────────

def test_diff_shows_added_changed_and_deactivated_rules_and_moved_lineups(seeded):
    v1, kept = add_rule(seeded, pattern="summer cup")
    with change_ruleset(seeded, author="tester", message="A busy afternoon") as change:
        change.add_rule(dimension="campaign", field="campaign", pattern="sc26", value="Summer Cup 2026")
        change.edit_rule(kept.rule_key, priority=50, pattern="summer-cup")
        change.set_lineup("Summer Cup 2026", {"Zestify Zero": 1}, workspace="pinecrest")   # as it already was
        change.set_lineup("Summer Cup 2026", {"Zestify Lime": 1, "Zestify Original": 1}, workspace="northgate")
    with change_ruleset(seeded, author="tester", message="Retire the old pattern") as change:
        change.deactivate_rule(kept.rule_key)
    v3 = change.version_id

    diff = diff_versions(seeded, v1, v3)
    changes = {c.rule_key: c for c in diff.rules}
    assert changes[kept.rule_key].kind == CHANGED
    assert set(changes[kept.rule_key].fields) == {"pattern", "priority", "active"}
    assert [c.kind for c in diff.rules if c.rule_key != kept.rule_key] == [ADDED]
    ruleset = load_ruleset(seeded)
    assert {(ruleset.label(c.product_value_id), c.before_share, c.after_share) for c in diff.lineups} == {
        ("Zestify Lime", 0.6, 0.5),
        ("Zestify Original", 0.4, 0.5),
    }
    assert {c.kind for c in diff_versions(seeded, v3, v1).rules if c.rule_key != kept.rule_key} == {REMOVED}
    assert diff_versions(seeded, v3, v3).is_empty


def test_a_revert_is_a_new_version_with_the_old_contents(seeded):
    v1, rule = add_rule(seeded, pattern="summer cup")
    v2, _ = edit(seeded, rule.rule_key, pattern="sc26")
    v3 = revert_to_version(seeded, v1, author="tester")
    assert v3 == v2 + 1
    assert diff_versions(seeded, v1, v3).is_empty
    assert rule_in(seeded, v3, rule.rule_key).id == rule_in(seeded, v1, rule.rule_key).id   # the very same revision
    assert revert_to_version(seeded, v3, author="tester") is None   # already there: nothing to record
