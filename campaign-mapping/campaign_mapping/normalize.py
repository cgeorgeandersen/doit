"""Case and whitespace normalization.

Raw strings and rule patterns go through the same function, so a rule written
as "Summer Cup" matches "  SUMMER%20cup " without anyone writing a regex for it.
Raw strings are never changed in the database; normalization happens in memory
on every run. That keeps the original evidence intact, and it means a change
here changes results, so it must come with a new ENGINE_VERSION.

Deliberately conservative: separators such as "-" and "_" are left alone.
"summer-cup" and "summer_cup" are different strings until a rule says they
mean the same thing. Merging them here would be a classification decision
hidden where nobody can see it, review it or version it.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Protocol

UTM_FIELDS: tuple[str, ...] = ("source", "medium", "campaign", "content", "term")
ANY_FIELD = "any"
FIELD_SEPARATOR = " | "

# Invisible characters that ride along with copy and paste: zero-width
# space/joiners, word joiner, and the byte-order mark spreadsheets leave on
# the first cell.
_INVISIBLE = dict.fromkeys(map(ord, "​‌‍⁠﻿"))
# How a URL writes a space. UTM values are URL query parameters.
_ENCODED_SPACE = re.compile(r"%20|\+", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s+")


def normalize_text(value: object) -> str:
    """Lowercase text with URL-encoded spaces decoded and whitespace collapsed.

    >>> normalize_text("  Summer%20CUP\\u00a0 2026 ")
    'summer cup 2026'
    """
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    text = unicodedata.normalize("NFKC", str(value)).translate(_INVISIBLE)
    text = _ENCODED_SPACE.sub(" ", text).casefold()
    return _WHITESPACE.sub(" ", text).strip()


class _HasUtmFields(Protocol):
    source: str
    medium: str
    campaign: str
    content: str
    term: str


@dataclass(frozen=True)
class NormalizedUtm:
    """The five UTM fields of one string, normalized."""

    source: str
    medium: str
    campaign: str
    content: str
    term: str

    @classmethod
    def of(cls, record: _HasUtmFields) -> NormalizedUtm:
        return cls(*(normalize_text(getattr(record, name)) for name in UTM_FIELDS))

    @classmethod
    def of_fields(cls, source: object, medium: object, campaign: object, content: object, term: object) -> NormalizedUtm:
        return cls(*(normalize_text(value) for value in (source, medium, campaign, content, term)))

    @property
    def full(self) -> str:
        """All five fields in a fixed order, which is what a rule on field "any" reads."""
        return FIELD_SEPARATOR.join((self.source, self.medium, self.campaign, self.content, self.term))

    def field(self, name: str) -> str:
        if name == ANY_FIELD:
            return self.full
        if name not in UTM_FIELDS:
            raise ValueError(f"Unknown UTM field {name!r}; use one of {ANY_FIELD}, {', '.join(UTM_FIELDS)}")
        return getattr(self, name)
