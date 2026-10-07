import importlib.util
import sys
from collections import Counter
from pathlib import Path

import pytest

from campaign_mapping.normalize import normalize_text
from campaign_mapping.seed import CAMPAIGNS, NON_CAMPAIGN, OPERATORS, VALUES

PROJECT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("generate_data", PROJECT / "scripts" / "generate_data.py")
generate_data = importlib.util.module_from_spec(_spec)
sys.modules["generate_data"] = generate_data   # dataclasses look their module up here
_spec.loader.exec_module(generate_data)


@pytest.fixture(scope="module")
def generated():
    return generate_data.generate(generate_data.DEFAULT_SEED)


def test_the_same_seed_gives_the_same_data(generated):
    assert generate_data.generate(generate_data.DEFAULT_SEED) == generated
    assert generate_data.generate(7)[0] != generated[0]


def test_the_committed_files_are_exactly_what_the_generator_writes(generated, tmp_path):
    strings, truth = generated
    generate_data.write_csv(tmp_path / "strings.csv", generate_data.STRING_COLUMNS, strings)
    generate_data.write_csv(tmp_path / "truth.csv", generate_data.TRUTH_COLUMNS, truth)
    assert (tmp_path / "strings.csv").read_bytes() == (PROJECT / "data" / generate_data.STRINGS_FILE).read_bytes()
    assert (tmp_path / "truth.csv").read_bytes() == (PROJECT / "data" / generate_data.TRUTH_FILE).read_bytes()


def test_about_five_thousand_spend_weighted_rows_from_five_operators(generated):
    strings, _ = generated
    assert 4_500 <= len(strings) <= 5_500
    assert {row["operator"] for row in strings} == {name for _, name in OPERATORS}
    assert all(float(row["spend"]) >= 0 for row in strings)
    assert sum(float(row["spend"]) for row in strings) > 1_000_000
    sends = [row for row in strings if row["sends"] != ""]
    assert sends and all(row["utm_medium"].lower() in {"email", "e-mail", "sms"} for row in sends)


def test_the_ground_truth_covers_every_row_and_stays_in_its_own_file(generated):
    strings, truth = generated
    assert [row["row_id"] for row in strings] == [row["row_id"] for row in truth]
    assert not any(column.startswith("true_") for column in generate_data.STRING_COLUMNS)
    campaigns = {name for name, *_ in CAMPAIGNS} | {NON_CAMPAIGN}
    assert {row["true_campaign"] for row in truth} == campaigns
    assert {row["true_type"] for row in truth} == {value for value, _ in VALUES["type"]}


def test_operators_keep_their_own_sloppy_habits(generated):
    strings, truth = generated
    summer = {normalize_text(s["utm_campaign"]) for s, t in zip(strings, truth, strict=True) if t["true_campaign"] == "Summer Cup 2026"}
    assert len(summer) >= 8                                    # one campaign, many spellings
    assert {"sc-26", "sc_26"} <= summer                        # abbreviations
    assert any("%20" in s["utm_campaign"] or "+" in s["utm_campaign"] for s in strings)   # URL-encoded spaces
    facebook = {s["utm_source"] for s in strings if s["utm_source"].lower() in {"fb", "facebook", "fb_paid", "meta"}}
    assert len(facebook) >= 4                                  # fb vs facebook vs FB vs fb_paid ...


def test_there_is_noise_ambiguity_and_double_exports(generated):
    strings, truth = generated
    assert {t["true_type"] for t in truth} >= {"Operational", "Transactional"}
    two_campaigns = [s["utm_campaign"] for s in strings
                     if "summer" in s["utm_campaign"].lower() and "kickoff" in s["utm_campaign"].lower()]
    assert two_campaigns
    rows = Counter(tuple(v for k, v in s.items() if k != "row_id") for s in strings)
    assert any(n > 1 for n in rows.values())
