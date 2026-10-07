import pytest

from campaign_mapping.matching import InvalidRule, compile_pattern
from campaign_mapping.normalize import normalize_text


def matches(match_type, pattern, raw):
    return compile_pattern(match_type, pattern)(normalize_text(raw))


def test_contains_finds_the_pattern_anywhere():
    assert matches("contains", "summer cup", "Zestify SUMMER  Cup 2026")
    assert not matches("contains", "summer cup", "summer-cup-2026")


def test_exact_needs_the_whole_value():
    assert matches("exact", "fb", " FB ")
    assert not matches("exact", "fb", "fb_paid")


def test_starts_with_needs_the_beginning():
    assert matches("starts_with", "fb", "FB_paid")
    assert not matches("starts_with", "fb", "paid_fb")


def test_patterns_are_normalized_like_strings():
    assert matches("contains", "  Summer%20CUP ", "summer cup 26")


def test_regex_searches_anywhere_and_ignores_case():
    assert matches("regex", r"summer[\s_-]*cup", "Promo_SUMMER-Cup_26")
    assert matches("regex", r"sc-?26", "launch_sc26")
    assert not matches("regex", r"^sc26$", "launch_sc26")   # anchors ask for the whole value


def test_regex_is_compiled_as_written():
    # Lowercasing the pattern would turn \D (not a digit) into \d (a digit).
    assert matches("regex", r"cup\D", "cup-26")
    assert not matches("regex", r"cup\D", "cup26")


def test_a_regex_for_an_empty_value_is_allowed():
    assert matches("regex", r"^$", "   ")
    assert not matches("regex", r"^$", "x")


@pytest.mark.parametrize("pattern", [".*", "a*", "|", "(?:)", r"\s*"])
def test_catch_all_regexes_are_refused(pattern):
    with pytest.raises(InvalidRule, match="catch-all"):
        compile_pattern("regex", pattern)


def test_an_invalid_regex_is_refused():
    with pytest.raises(InvalidRule, match="Invalid regex"):
        compile_pattern("regex", "summer(cup")


@pytest.mark.parametrize("pattern", ["", "   ", "%20"])
def test_a_blank_pattern_is_refused(pattern):
    with pytest.raises(InvalidRule, match="empty"):
        compile_pattern("contains", pattern)


def test_an_unknown_match_type_is_refused():
    with pytest.raises(InvalidRule, match="match type"):
        compile_pattern("fuzzy", "summer")
