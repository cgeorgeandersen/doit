"""Suggestions for the review queue: which value an unrecognized string most likely means.

Fuzzy matching (rapidfuzz) against three things the ruleset already knows:
field values already classified, the patterns of existing rules, and the
controlled values' own names, plus one plain heuristic: a short token that
spells a value's initials ("sr" for Spring Refresh) is an abbreviation of it.
Numbers are left out of the comparison, because "26" appears in every 2026
campaign and so says nothing about which one a string means.

Scores run from 0 to 100. A suggestion is only a suggestion: accepting one
writes a rule, so the decision is versioned and holds for every future import.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from rapidfuzz import fuzz, process

from .models import ASSIGN, Ruleset

_LETTER_DIGIT = re.compile(r"(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])")
_SEPARATORS = re.compile(r"[\s_\-.+/|%]+")
_REGEX_SYNTAX = re.compile(r"\[[^\]]*\]|\\.|[\^$.*+?(){}|]")


@dataclass(frozen=True)
class Suggestion:
    value: str
    score: float
    reason: str


INITIALS_SCORE = 95.0


def comparable(text: str) -> str:
    """Text reduced to its words, numbers dropped: "SC26_Promo" and "sc promo 2026" compare equal."""
    lowered = _LETTER_DIGIT.sub(" ", str(text).casefold())
    return " ".join(word for word in _SEPARATORS.sub(" ", lowered).split() if not word.isdigit())


def initials(name: str) -> set[str]:
    """Abbreviations a value goes by: "Pinecrest Fall Fest 2026" gives pff, pf and ff."""
    words = comparable(name).split()
    if len(words) < 2:
        return set()
    return {"".join(w[0] for w in words), "".join(w[0] for w in words[:2]), "".join(w[0] for w in words[-2:])}


def suggest(
    text: str,
    dimension: str,
    ruleset: Ruleset,
    examples: Mapping[str, str],
    *,
    limit: int = 3,
    cutoff: float = 70.0,
) -> list[Suggestion]:
    """The likeliest values for `text` on `dimension`, best first.

    `examples` maps field values already classified on this dimension to their
    value, the strongest evidence there is: "sc-26" looks like "sc26_promo",
    which the rules already call Summer Cup 2026.
    """
    query = comparable(text)
    if not query:
        return []
    best: dict[str, Suggestion] = {}

    def offer(value: str | None, score: float, reason: str) -> None:
        if value and score >= cutoff and (value not in best or score > best[value].score):
            best[value] = Suggestion(value, round(score, 1), reason)

    choices: dict[str, tuple[str, str]] = {}
    for example, value in examples.items():
        choices.setdefault(comparable(example), (example, value))
    for match, score, _ in process.extract(query, list(choices), scorer=fuzz.WRatio, limit=10, score_cutoff=cutoff):
        example, value = choices[match]
        offer(value, score, f'looks like "{example}", already {value}')

    for rule in ruleset.rules:
        if rule.dimension == dimension and rule.active and rule.action == ASSIGN:
            pattern = _REGEX_SYNTAX.sub(" ", rule.pattern) if rule.match_type == "regex" else rule.pattern
            offer(ruleset.label(rule.value_id), fuzz.WRatio(query, comparable(pattern)),
                  f'looks like the pattern "{rule.pattern}" ({rule.rule_key})')

    tokens = {token for token in query.split() if token.isalpha() and 2 <= len(token) <= 4}
    for value in ruleset.values:
        if value.dimension == dimension and value.active:
            offer(value.value, fuzz.WRatio(query, comparable(value.value)), "looks like the value's own name")
            abbreviation = tokens & initials(value.value)
            if abbreviation:
                offer(value.value, INITIALS_SCORE, f'"{sorted(abbreviation)[0]}" spells its initials')

    return sorted(best.values(), key=lambda s: (-s.score, s.value))[:limit]
