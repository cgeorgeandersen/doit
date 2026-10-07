"""The fictional Zestify network: operators, dimensions, values, campaigns and product lineups.

Every name here is invented. Zestify is a made-up beverage brand, and its five
operators are made-up bottlers and distributors.
"""

from __future__ import annotations

import sqlite3

from .db import transaction
from .models import NETWORK, WORKSPACE
from .rulesets import change_ruleset
from .taxonomy import add_value, create_campaign, create_dimension, create_workspace

SEED_AUTHOR = "seed"

OPERATORS = (
    ("northgate", "Northgate Beverage"),
    ("pinecrest", "Pinecrest Bottling"),
    ("harborline", "Harborline Distributing"),
    ("sunvale", "Sunvale Drinks"),
    ("redrock", "Redrock Beverage"),
)

# key, label, layer, multi-valued, description
DIMENSIONS = (
    ("campaign", "Campaign", NETWORK, False,
     "The campaign an ad or send belongs to. A shared fact: every operator sees the same answer."),
    ("product", "Product", WORKSPACE, True,
     "The products the spend promotes. Can hold several. Each operator may attribute a campaign to its own products."),
    ("objective", "Objective", NETWORK, False,
     "What the activity is for, in funnel terms."),
    ("type", "Type", NETWORK, False,
     "Marketing, or operational and transactional sends that are not marketing at all."),
)

NON_CAMPAIGN = "Non-campaign"
NOT_APPLICABLE = "Not applicable"

VALUES = {
    "product": (
        ("Zestify Original", "The flagship lemon-lime soda."),
        ("Zestify Zero", "Zero sugar."),
        ("Zestify Lime", "Lime twist."),
        ("Zestify Berry", "Mixed berry."),
        ("Zestify Ginger", "Ginger fizz, a winter seasonal."),
        (NOT_APPLICABLE, "Promotes no product, such as a receipt. A decision, not a default."),
    ),
    "objective": (
        ("Awareness", "Reach people who don't know the product yet."),
        ("Consideration", "Get people to look closer: samples, recipes, store locators."),
        ("Conversion", "Drive a purchase: coupons, offers, retargeting."),
        ("Retention", "Keep existing customers: loyalty and rewards."),
        (NOT_APPLICABLE, "Not marketing, so no funnel objective. A decision, not a default."),
    ),
    "type": (
        ("Marketing", "Promotes the brand, a product or a campaign."),
        ("Operational", "Keeps customers informed: reminders, holiday hours, service notices."),
        ("Transactional", "Triggered by a customer's own action: receipts, order and delivery confirmations."),
    ),
}

# name, start, end, operator (None: every operator runs it)
CAMPAIGNS = (
    ("Winter Warmup 2026", "2026-01-05", "2026-02-28", None),
    ("Spring Refresh 2026", "2026-03-02", "2026-04-30", None),
    ("Summer Cup 2026", "2026-05-18", "2026-08-30", None),
    ("Fall Kickoff 2026", "2026-08-24", "2026-10-25", None),
    ("Harborline Harbor Days 2026", "2026-07-10", "2026-07-19", "harborline"),
    ("Pinecrest Fall Fest 2026", "2026-09-12", "2026-09-27", "pinecrest"),
)
NON_CAMPAIGN_DESCRIPTION = "Operational or transactional sends that belong to no campaign. A decision, not a default."

# The network lineup: which products each campaign's spend goes to, by relative weight.
NETWORK_LINEUPS = {
    "Winter Warmup 2026": {"Zestify Ginger": 2, "Zestify Original": 1},
    "Spring Refresh 2026": {"Zestify Lime": 1, "Zestify Zero": 1},
    "Summer Cup 2026": {"Zestify Original": 1, "Zestify Zero": 1, "Zestify Lime": 1},
    "Fall Kickoff 2026": {"Zestify Original": 1, "Zestify Berry": 1},
    "Harborline Harbor Days 2026": {"Zestify Lime": 1, "Zestify Zero": 1},
    "Pinecrest Fall Fest 2026": {"Zestify Berry": 1},
}

# Operators that attribute a shared campaign to their own products. Each
# changes only that operator's lens; the network roll-up never sees it.
OPERATOR_LINEUPS = {
    ("northgate", "Summer Cup 2026"): {"Zestify Lime": 3, "Zestify Original": 2},
    ("pinecrest", "Summer Cup 2026"): {"Zestify Zero": 1},
}


def is_seeded(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT 1 FROM workspaces LIMIT 1").fetchone() is not None


def seed_taxonomy(conn: sqlite3.Connection, *, author: str = SEED_AUTHOR) -> int:
    """Load the Zestify vocabulary into a fresh database. Returns the version holding the lineups."""
    if is_seeded(conn):
        raise RuntimeError("This database already has operators; seed only a fresh one")
    with transaction(conn):
        for slug, name in OPERATORS:
            create_workspace(conn, slug, name)
        for order, (key, label, layer, multi_valued, description) in enumerate(DIMENSIONS, start=1):
            create_dimension(
                conn,
                key,
                label,
                created_by=author,
                admin=True,
                layer=layer,
                multi_valued=multi_valued,
                sort_order=order,
                description=description,
            )
        for name, start, end, operator in CAMPAIGNS:
            create_campaign(conn, name, start_date=start, end_date=end, workspace=operator, created_by=author)
        add_value(conn, "campaign", NON_CAMPAIGN, created_by=author, description=NON_CAMPAIGN_DESCRIPTION)
        for dimension, values in VALUES.items():
            for value, description in values:
                add_value(conn, dimension, value, created_by=author, description=description)

    with change_ruleset(conn, author=author, message="Seed campaign product lineups") as change:
        for campaign, products in NETWORK_LINEUPS.items():
            change.set_lineup(campaign, products)
        for (operator, campaign), products in OPERATOR_LINEUPS.items():
            change.set_lineup(campaign, products, workspace=operator)
    assert change.version_id is not None
    return change.version_id
