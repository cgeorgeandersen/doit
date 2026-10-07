#!/usr/bin/env python3
"""Generate the synthetic Zestify UTM data, and its ground truth in a separate file.

    python scripts/generate_data.py            # writes data/utm_strings.csv and data/ground_truth.csv
    python scripts/generate_data.py --seed 7   # a different, equally reproducible dataset

Every name is invented: Zestify is a made-up beverage brand and its five
operators are made-up bottlers. The same seed always produces the same bytes.

Each operator has its own habits, the way real teams do: a small set of
campaign spellings it keeps reusing (snake_case, "sc26", "Summer%20Cup",
"SUMMER_CUP_2026", a typo nobody fixed), its own names for sources and
mediums ("fb" vs "facebook" vs "FB_paid"), and its own operational and
transactional sends (receipts, reminders, holiday hours) mixed in with the
marketing. A few placements carry two campaign names at once.

The ground truth (true campaign and true type for every row) is for
evaluation only and never goes into the app.
"""

from __future__ import annotations

import argparse
import csv
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

DEFAULT_SEED = 2026
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
STRINGS_FILE = "utm_strings.csv"
TRUTH_FILE = "ground_truth.csv"

STRING_COLUMNS = (
    "row_id", "operator", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "activity_date", "spend", "sends",
)
TRUTH_COLUMNS = ("row_id", "true_campaign", "true_type")

FIRST_WEEK = date(2026, 1, 5)    # the data covers Monday 5 January to the week of 28 September 2026
LAST_WEEK = date(2026, 9, 28)

MARKETING, OPERATIONAL, TRANSACTIONAL = "Marketing", "Operational", "Transactional"
NON_CAMPAIGN = "Non-campaign"


@dataclass(frozen=True)
class Campaign:
    name: str
    words: tuple[str, ...]      # how people spell it out
    short: str                  # how people abbreviate it
    start: date
    end: date
    weight: float               # relative budget
    owner: str | None = None    # a local campaign's operator


CAMPAIGNS = (
    Campaign("Winter Warmup 2026", ("winter", "warmup"), "ww", date(2026, 1, 5), date(2026, 2, 28), 1.0),
    Campaign("Spring Refresh 2026", ("spring", "refresh"), "sr", date(2026, 3, 2), date(2026, 4, 30), 1.1),
    Campaign("Summer Cup 2026", ("summer", "cup"), "sc", date(2026, 5, 18), date(2026, 8, 30), 2.2),
    Campaign("Fall Kickoff 2026", ("fall", "kickoff"), "fk", date(2026, 8, 24), date(2026, 10, 25), 1.2),
    Campaign("Harborline Harbor Days 2026", ("harbor", "days"), "hd", date(2026, 7, 10), date(2026, 7, 19), 0.9, "harborline"),
    Campaign("Pinecrest Fall Fest 2026", ("fall", "fest"), "ff", date(2026, 9, 12), date(2026, 9, 27), 0.9, "pinecrest"),
)


@dataclass(frozen=True)
class Operator:
    slug: str
    name: str
    budget: float                                   # relative size
    styles: dict[str, float]                        # how it spells campaign names, by weight
    channels: dict[str, float]                      # where it spends, by weight
    sources: dict[str, tuple[str, ...]]             # its spellings of each channel's source
    mediums: dict[str, tuple[str, ...]]             # and of its medium
    case: str = "lower"                             # how it writes content: lower, upper or title
    noise: tuple[tuple[str, str, str], ...] = ()    # operational and transactional sends: (utm_campaign, type, channel)
    spellings: int = 3                              # campaign spellings it settles on per campaign
    extra: dict = field(default_factory=dict)


OPERATORS = (
    Operator(
        "northgate", "Northgate Beverage", 1.45,
        styles={"upper": 3, "suffix": 3, "abbrev_upper": 2, "brand": 2},
        channels={"facebook": 4, "instagram": 3, "search": 2, "display": 1, "email": 1},
        sources={"facebook": ("FB", "fb_paid", "FACEBOOK"), "instagram": ("IG", "ig_paid"), "search": ("GOOGLE",),
                 "display": ("GDN",), "email": ("EMAIL",), "sms": ("SMS",)},
        mediums={"facebook": ("PAID_SOCIAL", "paid_social"), "instagram": ("PAID_SOCIAL",), "search": ("CPC",),
                 "display": ("DISPLAY",), "email": ("EMAIL",), "sms": ("SMS",)},
        case="upper",
        noise=(("ORDER_CONFIRMATION", TRANSACTIONAL, "email"), ("DELIVERY_REMINDER", OPERATIONAL, "email")),
    ),
    Operator(
        "pinecrest", "Pinecrest Bottling", 1.0,
        styles={"abbrev": 6, "snake": 3, "concat": 2},
        channels={"facebook": 3, "instagram": 2, "tiktok": 2, "search": 2, "email": 1},
        sources={"facebook": ("fb",), "instagram": ("ig",), "tiktok": ("tt", "tiktok"), "search": ("google",),
                 "email": ("email",), "sms": ("sms",)},
        mediums={"facebook": ("paidsocial",), "instagram": ("paidsocial",), "tiktok": ("paidsocial",),
                 "search": ("cpc",), "email": ("email",), "sms": ("sms",)},
        noise=(("ord_conf", TRANSACTIONAL, "email"), ("rte_chg_notice", OPERATIONAL, "sms")),
    ),
    Operator(
        "harborline", "Harborline Distributing", 0.8,
        styles={"title": 3, "encoded": 2, "typo": 4, "kebab": 2},
        channels={"facebook": 3, "instagram": 1, "search": 3, "display": 1, "email": 1},
        sources={"facebook": ("Facebook", "facebook"), "instagram": ("Instagram",), "search": ("Google Ads", "google"),
                 "display": ("Google Display",), "email": ("Email",), "sms": ("Text",)},
        mediums={"facebook": ("Paid Social", "paid social"), "instagram": ("Paid Social",),
                 "search": ("Paid Search", "paid search"), "display": ("Display",), "email": ("Email",), "sms": ("SMS",)},
        case="title",
        noise=(("Delivery Reminder", OPERATIONAL, "email"), ("Invoice Ready", TRANSACTIONAL, "email"),
               ("Holiday Hours July 4", OPERATIONAL, "email")),
    ),
    Operator(
        "sunvale", "Sunvale Drinks", 0.7,
        styles={"newsletter": 4, "concat": 2, "typo": 2, "camel": 2},
        channels={"email": 5, "sms": 2, "facebook": 2, "search": 1},
        sources={"facebook": ("facebook", "fb"), "search": ("google",), "email": ("sfmc", "email", "newsletter"),
                 "sms": ("sms", "text")},
        mediums={"facebook": ("social",), "search": ("cpc",), "email": ("email", "e-mail"), "sms": ("sms",)},
        noise=(("order_confirmation", TRANSACTIONAL, "email"), ("receipt", TRANSACTIONAL, "email"),
               ("password_reset", TRANSACTIONAL, "email"), ("delivery_window_reminder", OPERATIONAL, "sms"),
               ("holiday_hours", OPERATIONAL, "email"), ("route_change_notice", OPERATIONAL, "email"),
               ("service_survey", OPERATIONAL, "email")),
    ),
    Operator(
        "redrock", "Redrock Beverage", 1.05,
        styles={"kebab": 4, "camel": 3, "title": 2, "abbrev_dash": 2},
        channels={"facebook": 3, "tiktok": 2, "search": 3, "display": 1, "email": 1},
        sources={"facebook": ("meta", "facebook", "fb"), "tiktok": ("tiktok",), "search": ("google", "bing"),
                 "display": ("programmatic",), "email": ("email",), "sms": ("sms",)},
        mediums={"facebook": ("paid-social", "social"), "tiktok": ("paid-social",), "search": ("ppc",),
                 "display": ("display",), "email": ("email",), "sms": ("sms",)},
        noise=(("holiday-hours", OPERATIONAL, "email"), ("order-receipt", TRANSACTIONAL, "email")),
    ),
)

# Placements that name two campaigns at once, and what they really were.
# (operator, utm_campaign, true campaign, first week, last week, channel)
AMBIGUOUS = (
    ("northgate", "SUMMER_CUP_TO_FALL_KICKOFF_BRIDGE", "Fall Kickoff 2026", date(2026, 8, 24), date(2026, 8, 31), "facebook"),
    ("redrock", "spring-into-summer-cup", "Summer Cup 2026", date(2026, 5, 18), date(2026, 6, 8), "facebook"),
    ("pinecrest", "fallfest_x_kickoff", "Pinecrest Fall Fest 2026", date(2026, 9, 14), date(2026, 9, 28), "facebook"),
    ("sunvale", "winter_warmup_to_spring_refresh", "Spring Refresh 2026", date(2026, 3, 2), date(2026, 3, 16), "email"),
    ("harborline", "Summer Cup Harbor Days", "Harborline Harbor Days 2026", date(2026, 7, 13), date(2026, 7, 20), "search"),
)

PLACEMENTS_PER_OPERATOR = 190           # marketing placements, split across campaigns by budget
WEEKLY_SPEND = {                        # typical weekly spend of one placement, by channel
    "facebook": 900, "instagram": 650, "tiktok": 550, "search": 800, "display": 350,
}
SENDS = {"email": (4_000, 40_000, 0.004), "sms": (1_500, 12_000, 0.012)}   # (min, max, cost per send)
CREATIVES = ("video_15s", "video_6s", "carousel", "static", "story", "reel")
PRODUCT_HINTS = ("lime", "zero", "berry", "ginger", "original")
OBJECTIVE_HINTS = ("awareness", "rt", "coupon", "recipe", "loyalty")
SEARCH_TERMS = ("zestify soda", "lemon lime soda", "zero sugar soda", "zestify near me", "sparkling lime drink")
SUFFIXES = ("launch", "promo", "q3", "retargeting", "push")


# ── campaign spellings ──────────────────────────────────────────────────────

def _typo(rng: random.Random, word: str) -> str:
    if len(word) < 4:
        return word + word[-1]
    i = rng.randrange(1, len(word) - 1)
    kind = rng.choice(("drop", "double", "swap"))
    if kind == "drop":
        return word[:i] + word[i + 1:]
    if kind == "double":
        return word[:i] + word[i] + word[i:]
    return word[:i] + word[i + 1] + word[i] + word[i + 2:]


def spell(rng: random.Random, style: str, campaign: Campaign) -> str:
    words, short = campaign.words, campaign.short
    if style == "snake":
        return "_".join(words) + "_2026"
    if style == "suffix":
        return "_".join(words).upper() + "_" + rng.choice(SUFFIXES).upper()
    if style == "upper":
        return "_".join(words).upper() + "_2026"
    if style == "brand":
        return rng.choice(("ZESTIFY_", "ZST-")) + "".join(w.title() for w in words)
    if style == "concat":
        return "".join(words) + rng.choice(("", "26"))
    if style == "kebab":
        return "-".join(words) + "-26"
    if style == "title":
        return " ".join(w.title() for w in words) + " 2026"
    if style == "encoded":
        return rng.choice(("%20", "+")).join(w.title() for w in words) + rng.choice(("", "%202026"))
    if style == "camel":
        return "".join(w.title() for w in words) + "2026"
    if style == "newsletter":
        return "_".join(words) + rng.choice(("_newsletter", "_email", "_blast"))
    if style == "abbrev":
        return rng.choice((f"{short}26", f"{short}26_{rng.choice(SUFFIXES)}", f"{short}_26"))
    if style == "abbrev_upper":
        return f"{short.upper()}26_{rng.choice(SUFFIXES).title()}"
    if style == "abbrev_dash":
        return f"{short}-26"
    if style == "typo":
        typoed = list(words)
        i = rng.randrange(len(typoed))
        typoed[i] = _typo(rng, typoed[i])
        return rng.choice(("_", "-", " ")).join(typoed) + rng.choice(("", " 2026", "_26"))
    raise ValueError(f"unknown style {style}")


def _weighted(rng: random.Random, options: dict[str, float]) -> str:
    keys = list(options)
    return rng.choices(keys, weights=[options[k] for k in keys])[0]


def _case(text: str, case: str) -> str:
    if case == "upper":
        return text.upper()
    if case == "title":
        return text.replace("_", " ").title()
    return text


# ── rows ────────────────────────────────────────────────────────────────────

def _weeks(start: date, end: date) -> list[date]:
    """Mondays of the weeks a window touches, within the data window."""
    monday = max(FIRST_WEEK, start - timedelta(days=start.weekday()))
    weeks = []
    while monday <= min(end, LAST_WEEK + timedelta(days=6)) and monday <= LAST_WEEK:
        weeks.append(monday)
        monday += timedelta(weeks=1)
    return weeks


def _content(rng: random.Random, operator: Operator, channel: str) -> str:
    if channel in ("email", "sms"):
        text = rng.choice(("hero_banner", "cta_button", "footer_link", "header_image"))
    elif channel == "search":
        text = rng.choice(("rsa_1", "rsa_2", "brand_ad", "generic_ad"))
    else:
        text = f"{rng.choice(CREATIVES)}_{rng.choice('abc')}"
    if channel not in ("email", "sms") and rng.random() < 0.35:
        text = f"{rng.choice(PRODUCT_HINTS)}_{text}"
    if rng.random() < 0.3:
        text = f"{rng.choice(OBJECTIVE_HINTS)}_{text}"
    return _case(text, operator.case)


def _row(rng, operator, channel, campaign_text, week, base, true_campaign, true_type, content):
    source = rng.choice(operator.sources[channel])
    medium = rng.choice(operator.mediums[channel])
    term = rng.choice(SEARCH_TERMS) if channel == "search" else ""
    activity = week + timedelta(days=rng.randrange(7))
    if channel in SENDS:
        low, high, cost = SENDS[channel]
        sends = rng.randint(low, high)
        spend = round(sends * cost, 2)
    else:
        sends = ""
        spend = round(base * rng.uniform(0.55, 1.45), 2)
    return {
        "operator": operator.name, "utm_source": source, "utm_medium": medium, "utm_campaign": campaign_text,
        "utm_content": content, "utm_term": term, "activity_date": activity.isoformat(), "spend": f"{spend:.2f}",
        "sends": sends, "true_campaign": true_campaign, "true_type": true_type,
    }


def generate(seed: int = DEFAULT_SEED) -> tuple[list[dict], list[dict]]:
    """Return (strings, truth): the app's rows and, separately, what each row really was."""
    rng = random.Random(seed)
    rows: list[dict] = []
    for operator in OPERATORS:
        campaigns = [c for c in CAMPAIGNS if c.owner in (None, operator.slug)]
        total_weight = sum(c.weight for c in campaigns)
        for campaign in campaigns:
            # The handful of spellings this operator settles on for this campaign.
            styles = list(operator.styles)
            weights = [operator.styles[s] for s in styles]
            spellings = []
            for _ in range(operator.spellings):
                style = rng.choices(styles, weights=weights)[0]
                spellings.append(spell(rng, style, campaign))
            weeks = _weeks(campaign.start, campaign.end)
            if not weeks:
                continue
            placements = max(3, round(PLACEMENTS_PER_OPERATOR * campaign.weight / total_weight))
            for _ in range(placements):
                channel = _weighted(rng, operator.channels)
                campaign_text = rng.choices(spellings, weights=[5, 3, 2][: len(spellings)])[0]
                content = _content(rng, operator, channel)
                base = WEEKLY_SPEND.get(channel, 0) * operator.budget * rng.lognormvariate(0, 0.6)
                first = rng.randrange(len(weeks))
                length = max(1, round(len(weeks) * rng.uniform(0.4, 1.0)))
                for week in weeks[first:first + length]:
                    rows.append(_row(rng, operator, channel, campaign_text, week, base, campaign.name, MARKETING, content))

        for campaign_text, true_type, channel in operator.noise:
            content = _case(rng.choice(("transactional_template", "notice_body", "cta_button")), operator.case)
            for week in _weeks(FIRST_WEEK, LAST_WEEK):
                if "holiday" in campaign_text.lower() and not date(2026, 6, 22) <= week <= date(2026, 7, 6):
                    continue   # holiday-hours notices go out around the Fourth of July
                if rng.random() < 0.8:
                    rows.append(_row(rng, operator, channel, campaign_text, week, 0, NON_CAMPAIGN, true_type, content))

    for slug, campaign_text, true_campaign, start, end, channel in AMBIGUOUS:
        operator = next(o for o in OPERATORS if o.slug == slug)
        content = _content(rng, operator, channel)
        base = WEEKLY_SPEND.get(channel, 0) * operator.budget * 1.2
        for week in _weeks(start, end):
            rows.append(_row(rng, operator, channel, campaign_text, week, base, true_campaign, MARKETING, content))

    # A double export: some rows arrive twice, exactly the same.
    for original in rng.sample(rows, k=len(rows) // 200):
        rows.append(dict(original))

    rows.sort(key=lambda r: (r["activity_date"], r["operator"], r["utm_campaign"], r["utm_content"], r["utm_source"]))
    strings, truth = [], []
    for row_id, row in enumerate(rows, start=1):
        strings.append({"row_id": row_id, **{k: row[k] for k in STRING_COLUMNS[1:]}})
        truth.append({"row_id": row_id, "true_campaign": row["true_campaign"], "true_type": row["true_type"]})
    return strings, truth


def write_csv(path: Path, columns: tuple[str, ...], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", type=Path, default=DATA_DIR)
    args = parser.parse_args()
    strings, truth = generate(args.seed)
    write_csv(args.out / STRINGS_FILE, STRING_COLUMNS, strings)
    write_csv(args.out / TRUTH_FILE, TRUTH_COLUMNS, truth)
    spend = sum(float(r["spend"]) for r in strings)
    distinct = len({tuple(r[k] for k in STRING_COLUMNS[1:7]) for r in strings})
    print(f"{len(strings):,} rows ({distinct:,} distinct strings), ${spend:,.0f} spend -> {args.out}")


if __name__ == "__main__":
    main()
