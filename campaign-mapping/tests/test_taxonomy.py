import sqlite3

import pytest

from campaign_mapping import taxonomy
from campaign_mapping.models import NETWORK, WORKSPACE
from campaign_mapping.rulesets import list_versions, load_ruleset
from campaign_mapping.runs import import_rows
from campaign_mapping.seed import CAMPAIGNS, OPERATORS


def test_the_seed_builds_the_zestify_network(seeded):
    dimensions = {d.key: d for d in taxonomy.load_dimensions(seeded)}
    assert list(dimensions) == ["campaign", "product", "objective", "type"]
    assert (dimensions["product"].layer, dimensions["product"].multi_valued) == (WORKSPACE, True)
    assert {key for key, d in dimensions.items() if d.layer == NETWORK and not d.multi_valued} == {
        "campaign",
        "objective",
        "type",
    }
    assert [w["name"] for w in taxonomy.list_workspaces(seeded)] == sorted(name for _, name in OPERATORS)

    campaigns = {c["name"]: c for c in taxonomy.list_campaigns(seeded)}
    assert len(campaigns) == len(CAMPAIGNS)
    summer = campaigns["Summer Cup 2026"]
    assert (summer["start_date"], summer["end_date"], summer["workspace"]) == ("2026-05-18", "2026-08-30", None)
    assert campaigns["Pinecrest Fall Fest 2026"]["workspace"] == "pinecrest"
    assert [v.value for v in taxonomy.load_values(seeded) if v.dimension == "type"] == [
        "Marketing",
        "Operational",
        "Transactional",
    ]

    versions = list_versions(seeded)
    assert [(v.id, v.lineup_rows > 0) for v in versions] == [(1, False), (2, True)]
    assert load_ruleset(seeded, 2).rules == ()   # lineups only; the starter rules arrive with the data


def test_only_an_admin_creates_a_dimension(seeded):
    with pytest.raises(PermissionError):
        taxonomy.create_dimension(seeded, "channel", "Channel", created_by="analyst")
    taxonomy.create_dimension(seeded, "channel", "Channel", created_by="admin", admin=True)
    assert "channel" in [d.key for d in taxonomy.load_dimensions(seeded)]


def test_anyone_can_add_a_value_but_not_a_duplicate(seeded):
    taxonomy.add_value(seeded, "campaign", "  Holiday   Cheer 2026 ", created_by="analyst")
    assert taxonomy.value_id(seeded, "campaign", "holiday cheer 2026")
    with pytest.raises(ValueError, match="already has"):
        taxonomy.add_value(seeded, "campaign", "HOLIDAY CHEER 2026", created_by="analyst")
    with pytest.raises(LookupError):
        taxonomy.add_value(seeded, "channel", "Paid Social", created_by="analyst")


def test_values_are_deactivated_never_renamed_or_deleted(seeded):
    awareness = taxonomy.value_id(seeded, "objective", "Awareness")
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("UPDATE dimension_values SET value = 'Reach' WHERE id = ?", (awareness,))
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("DELETE FROM dimension_values WHERE id = ?", (awareness,))
    taxonomy.set_value_active(seeded, awareness, False)
    assert not next(v for v in taxonomy.load_values(seeded) if v.id == awareness).active


def test_a_dimensions_shape_is_fixed_but_its_label_is_not(seeded):
    for statement in [
        "UPDATE dimensions SET multi_valued = 1 WHERE key = 'campaign'",
        "UPDATE dimensions SET layer = 'workspace' WHERE key = 'campaign'",
        "DELETE FROM dimensions WHERE key = 'objective'",
    ]:
        with pytest.raises(sqlite3.IntegrityError):
            seeded.execute(statement)
    seeded.execute("UPDATE dimensions SET label = 'Campaign name' WHERE key = 'campaign'")


def insert_rule(conn, dimension, value_id, workspace_id=None):
    """Write a rule with raw SQL, skipping every Python check, to test what the database itself refuses."""
    dimension_id = conn.execute("SELECT id FROM dimensions WHERE key = ?", (dimension,)).fetchone()[0]
    conn.execute(
        "INSERT INTO rules (rule_key, revision, dimension_id, field, match_type, pattern, action, value_id,"
        " priority, workspace_id, owner, active, created_by, created_at)"
        " VALUES ('R9999', 1, ?, 'any', 'contains', 'x', 'assign', ?, 100, ?, 'sql', 1, 'sql', 'now')",
        (dimension_id, value_id, workspace_id),
    )


def test_the_database_refuses_a_value_from_another_dimension(seeded):
    with pytest.raises(sqlite3.IntegrityError):
        insert_rule(seeded, "campaign", taxonomy.value_id(seeded, "product", "Zestify Lime"))


def test_the_database_refuses_operator_rules_on_shared_dimensions(seeded):
    northgate = taxonomy.workspace_id(seeded, "northgate")
    with pytest.raises(sqlite3.IntegrityError):
        insert_rule(seeded, "campaign", taxonomy.value_id(seeded, "campaign", "Summer Cup 2026"), northgate)
    insert_rule(seeded, "product", taxonomy.value_id(seeded, "product", "Zestify Lime"), northgate)


def test_campaign_records_and_lineups_point_at_the_right_dimensions(seeded):
    lime = taxonomy.value_id(seeded, "product", "Zestify Lime")
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute(
            "INSERT INTO campaigns (value_id, start_date, end_date, created_by, created_at)"
            " VALUES (?, '2026-01-01', '2026-01-31', 'sql', 'now')",
            (lime,),
        )
    summer = taxonomy.campaign_id(seeded, "Summer Cup 2026")
    awareness = taxonomy.value_id(seeded, "objective", "Awareness")
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute(
            "INSERT INTO campaign_products (campaign_id, product_value_id, weight, created_by, created_at)"
            " VALUES (?, ?, 1, 'sql', 'now')",
            (summer, awareness),
        )


@pytest.mark.parametrize(
    "start, end", [("2026-02-30", "2026-03-01"), ("2026-5-1", "2026-06-01"), ("2026-06-01", "2026-05-01")]
)
def test_campaign_dates_must_be_real_and_in_order(seeded, start, end):
    with pytest.raises(sqlite3.IntegrityError):
        taxonomy.create_campaign(seeded, f"Bad dates {start}", start_date=start, end_date=end, created_by="tester")
    with pytest.raises(LookupError):   # the half-made campaign value went with it
        taxonomy.value_id(seeded, "campaign", f"Bad dates {start}")


# ── raw strings ─────────────────────────────────────────────────────────────

def test_raw_strings_are_kept_exactly_as_imported(seeded):
    result = import_rows(
        seeded,
        [
            {
                "operator": "Northgate Beverage",
                "utm_source": "  FB ",
                "utm_campaign": "SC26_Launch ",
                "spend": "$1,200.50",
                "sends": "",
                "activity_date": "2026-06-01",
            },
            {"operator": "redrock", "utm_campaign": None, "spend": None},
        ],
        source_name="june.csv",
        imported_by="tester",
    )
    rows = seeded.execute(
        "SELECT utm_source, utm_campaign, utm_medium, spend, sends, activity_date, batch_id FROM raw_strings ORDER BY id"
    ).fetchall()
    assert tuple(rows[0]) == ("  FB ", "SC26_Launch ", "", 1200.5, None, "2026-06-01", result.batch_id)
    assert tuple(rows[1])[:4] == ("", "", "", 0.0)
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("UPDATE raw_strings SET utm_source = 'fb'")
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("DELETE FROM raw_strings")


@pytest.mark.parametrize(
    "row, message",
    [
        ({"utm_source": "fb"}, "no operator"),
        ({"operator": "Bluelake Bottling", "utm_source": "fb"}, "No operator"),
        ({"operator": "northgate", "spend": "lots"}, "not a number"),
        ({"operator": "northgate", "spend": -5}, "zero or more"),
        ({"operator": "northgate", "sends": 2.5}, "whole number"),
        ({"operator": "northgate", "activity_date": "06/01/2026"}, "YYYY-MM-DD"),
    ],
)
def test_an_import_with_a_bad_row_stores_nothing(seeded, row, message):
    good = {"operator": "northgate", "utm_source": "fb", "spend": 10}
    with pytest.raises((ValueError, LookupError), match=message):
        import_rows(seeded, [good, row], source_name="bad.csv", imported_by="tester")
    assert seeded.execute("SELECT COUNT(*) FROM raw_strings").fetchone()[0] == 0
    assert seeded.execute("SELECT COUNT(*) FROM import_batches").fetchone()[0] == 0


def test_duplicate_rows_share_a_hash(seeded):
    row = {"operator": "northgate", "utm_source": "fb", "utm_campaign": "sc26", "spend": 10, "activity_date": "2026-06-01"}
    import_rows(seeded, [row, dict(row), {**row, "spend": 11}], source_name="dupes.csv", imported_by="tester")
    hashes = [r[0] for r in seeded.execute("SELECT row_hash FROM raw_strings ORDER BY id")]
    assert hashes[0] == hashes[1] != hashes[2]
