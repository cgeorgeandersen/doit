"""The four match types, each compiled once per rule into a test on normalized text."""

from __future__ import annotations

import re
from collections.abc import Callable

from .normalize import ANY_FIELD, UTM_FIELDS, normalize_text

MATCH_TYPES: tuple[str, ...] = ("contains", "exact", "starts_with", "regex")
FIELDS: tuple[str, ...] = (ANY_FIELD, *UTM_FIELDS)

Predicate = Callable[[str], bool]

# A regex that matches every one of these would match anything at all: a
# catch-all in disguise (".*", "a*", "|"). One that matches only some of them,
# like "^$" for an empty field, is fine.
_CATCH_ALL_PROBES = ("", "q", "zz9 | yy-x | w_v")


class InvalidRule(ValueError):
    """A pattern that can't be compiled, or that would act as a catch-all."""


def compile_pattern(match_type: str, pattern: str) -> Predicate:
    """Turn a rule's pattern into a test on normalized text.

    contains, exact and starts_with normalize the pattern the same way strings
    are normalized. regex is compiled exactly as written, case-insensitive, and
    searches anywhere in the text (anchor with ^ and $ for a whole value).
    Lowercasing a regex would change its meaning: \\D (not a digit) would
    become \\d (a digit).
    """
    if match_type == "regex":
        try:
            compiled = re.compile(pattern, re.IGNORECASE)
        except re.error as exc:
            raise InvalidRule(f"Invalid regex {pattern!r}: {exc}") from None
        if all(compiled.search(probe) for probe in _CATCH_ALL_PROBES):
            raise InvalidRule(f"Regex {pattern!r} matches anything, so it would act as a catch-all")
        return lambda text: compiled.search(text) is not None
    if match_type not in MATCH_TYPES:
        raise InvalidRule(f"Unknown match type {match_type!r}; use one of {', '.join(MATCH_TYPES)}")
    needle = normalize_text(pattern)
    if not needle:
        raise InvalidRule("The pattern is empty once case and whitespace are normalized")
    if match_type == "contains":
        return lambda text: needle in text
    if match_type == "exact":
        return lambda text: text == needle
    return lambda text: text.startswith(needle)
