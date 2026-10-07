import pytest

from campaign_mapping.normalize import FIELD_SEPARATOR, NormalizedUtm, normalize_text
from helpers import utm


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Summer Cup", "summer cup"),
        ("SUMMER CUP", "summer cup"),
        ("  summer cup  ", "summer cup"),
        ("summer    cup", "summer cup"),
        ("summer\tcup\n", "summer cup"),
        ("summer cup", "summer cup"),     # a non-breaking space from a pasted document
        ("Summer%20Cup", "summer cup"),        # a URL-encoded space
        ("summer+cup", "summer cup"),          # a query string's space
        ("summer%20%20cup", "summer cup"),
        ("﻿summer cup", "summer cup"),    # the byte-order mark on a spreadsheet's first cell
        ("summer​cup", "summercup"),      # a zero-width space is invisible, so it goes
        ("ＳＣ２６", "sc26"),                    # full-width characters
    ],
)
def test_case_and_whitespace_are_normalized(raw, expected):
    assert normalize_text(raw) == expected


@pytest.mark.parametrize("raw", ["summer-cup", "summer_cup", "summer.cup", "summercup"])
def test_separators_are_left_for_rules_to_decide(raw):
    assert normalize_text(raw) == raw


@pytest.mark.parametrize("missing", [None, float("nan"), "", "   "])
def test_missing_values_normalize_to_empty(missing):
    assert normalize_text(missing) == ""


def test_normalizing_twice_changes_nothing():
    for sample in ["  FB_Paid ", "Summer%20CUP", "a+b", "%2520", "x  y", "Ｚestify", "%%2020"]:
        once = normalize_text(sample)
        assert normalize_text(once) == once


def test_field_any_joins_all_five_in_a_fixed_order():
    normalized = NormalizedUtm.of(utm(1, source=" FB ", medium="Paid_Social", campaign="SC26", content="Video  A"))
    assert normalized.campaign == "sc26"
    assert normalized.field("any") == FIELD_SEPARATOR.join(["fb", "paid_social", "sc26", "video a", ""])
    with pytest.raises(ValueError):
        normalized.field("utm_campaign")
