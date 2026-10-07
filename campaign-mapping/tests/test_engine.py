import random
from dataclasses import replace

import pytest

from campaign_mapping.engine import (
    ENGINE_VERSION,
    INACTIVE,
    SHADOWED,
    audit_result,
    classify,
    explain,
    input_fingerprint,
    preview_rule,
)
from campaign_mapping.models import (
    BY_LINEUP,
    BY_RULE,
    CANDIDATE,
    CLASSIFIED,
    CONFLICT,
    FIRED,
    IGNORE,
    IGNORED,
    NETWORK,
    UNCLASSIFIED,
    WORKSPACE,
    Classification,
    Hit,
    RunResult,
)
from campaign_mapping.normalize import NormalizedUtm
from helpers import NORTHGATE, PINECREST, RulesetBuilder, utm


def values(ruleset, outcome):
    return ruleset.labels(outcome.value_ids)


# ── precedence ──────────────────────────────────────────────────────────────

def test_the_lowest_priority_number_wins():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026", priority=100)
    b.rule("campaign", "summer fest", "Pinecrest Fall Fest 2026", priority=10)
    ruleset = b.build()
    result = classify([utm(1, campaign="Summer Fest Kegs"), utm(2, campaign="Summer Cup")], ruleset)
    assert values(ruleset, result.get(1, "campaign")) == ["Pinecrest Fall Fest 2026"]
    assert values(ruleset, result.get(2, "campaign")) == ["Summer Cup 2026"]


def test_the_order_rules_are_listed_in_changes_nothing():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026")
    b.rule("campaign", "cup", "Summer Cup 2026")
    b.rule("campaign", "kickoff", "Fall Kickoff 2026", priority=50)
    b.rule("campaign", "summer", "Fall Kickoff 2026")
    ruleset = b.build()
    reordered = replace(ruleset, rules=tuple(reversed(ruleset.rules)))
    records = [utm(1, campaign="summer cup"), utm(2, campaign="summer kickoff"), utm(3, campaign="cup")]
    assert classify(records, ruleset).fingerprint() == classify(records, reordered).fingerprint()


# ── conflicts ───────────────────────────────────────────────────────────────

def test_a_tie_at_the_winning_priority_is_a_conflict_not_a_guess():
    b = RulesetBuilder.zestify()
    summer = b.rule("campaign", "summer", "Summer Cup 2026", priority=50)
    kickoff = b.rule("campaign", "kickoff", "Fall Kickoff 2026", priority=50)
    b.rule("campaign", "sc26", "Summer Cup 2026", priority=200)   # outranked, so no part of it
    ruleset = b.build()
    outcome = classify([utm(1, campaign="sc26_summer_kickoff_bundle")], ruleset).get(1, "campaign")
    assert outcome.status == CONFLICT
    assert outcome.value_ids == () and outcome.value_id is None   # nothing assigned
    assert outcome.rule_ids == (summer.id, kickoff.id)            # both sides kept for review
    assert {hit.role for hit in outcome.hits} == {CANDIDATE}
    assert {hit.value_id for hit in outcome.hits} == {summer.value_id, kickoff.value_id}


def test_rules_that_tie_on_the_same_value_agree_and_both_are_recorded():
    b = RulesetBuilder.zestify()
    first = b.rule("campaign", "summer", "Summer Cup 2026")
    second = b.rule("campaign", "sc26", "Summer Cup 2026")
    ruleset = b.build()
    outcome = classify([utm(1, campaign="sc26 summer")], ruleset).get(1, "campaign")
    assert outcome.status == CLASSIFIED
    assert values(ruleset, outcome) == ["Summer Cup 2026"]
    assert outcome.rule_ids == (first.id, second.id)
    assert sum(hit.weight for hit in outcome.hits) == pytest.approx(1)


def test_an_ignore_rule_marks_a_string_ignored():
    b = RulesetBuilder.zestify()
    ignore = b.rule("campaign", "test", field="campaign", action=IGNORE, priority=10)
    b.rule("campaign", "summer", "Summer Cup 2026")
    outcome = classify([utm(1, campaign="summer_test_do_not_use")], b.build()).get(1, "campaign")
    assert outcome.status == IGNORED
    assert outcome.value_ids == ()
    assert outcome.rule_ids == (ignore.id,)


def test_an_ignore_tied_with_an_assign_is_a_conflict():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "test", action=IGNORE)
    b.rule("campaign", "summer", "Summer Cup 2026")
    outcome = classify([utm(1, campaign="summer test")], b.build()).get(1, "campaign")
    assert outcome.status == CONFLICT and len(outcome.hits) == 2


# ── the default ─────────────────────────────────────────────────────────────

def test_a_string_no_rule_matches_stays_unclassified():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026")
    b.rule("type", "receipt", "Transactional")
    b.value("type", "Marketing")   # exists, and is never handed out as a fallback
    result = classify([utm(1, source="email", medium="email", campaign="june_newsletter")], b.build())
    for dimension, lens in [
        ("campaign", NETWORK),
        ("type", NETWORK),
        ("objective", NETWORK),
        ("product", NETWORK),
        ("product", WORKSPACE),
    ]:
        outcome = result.get(1, dimension, lens)
        assert outcome.status == UNCLASSIFIED
        assert outcome.hits == () and outcome.value_ids == () and outcome.method is None


def test_an_empty_ruleset_classifies_nothing():
    ruleset = RulesetBuilder.zestify().build()
    result = classify([utm(1, campaign="sc26"), utm(2, campaign="Summer Cup"), utm(3, campaign="receipt")], ruleset)
    assert {c.status for c in result.classifications} == {UNCLASSIFIED}
    assert len(result.unclassified) == 3 * 5   # four dimensions; product in both lenses


def test_inactive_rules_never_fire():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026", active=False)
    assert classify([utm(1, campaign="summer")], b.build()).get(1, "campaign").status == UNCLASSIFIED


# ── fields and normalization ────────────────────────────────────────────────

def test_a_rule_reads_only_the_field_it_names():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026", field="campaign")
    result = classify([utm(1, content="summer_video"), utm(2, campaign="summer")], b.build())
    assert result.get(1, "campaign").status == UNCLASSIFIED
    assert result.get(2, "campaign").status == CLASSIFIED


def test_field_any_reads_all_five():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026")
    assert classify([utm(1, content="summer_video")], b.build()).get(1, "campaign").status == CLASSIFIED


def test_case_and_whitespace_never_decide_a_match():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer cup", "Summer Cup 2026", match_type="exact", field="campaign")
    raw = ["SUMMER CUP", "  summer   cup ", "Summer%20Cup", "summer\tcup", "summer_cup"]
    result = classify([utm(i, campaign=text) for i, text in enumerate(raw, start=1)], b.build())
    assert [result.get(i, "campaign").status for i in range(1, 6)] == [CLASSIFIED] * 4 + [UNCLASSIFIED]


# ── multi-valued product ────────────────────────────────────────────────────

def test_a_multi_valued_dimension_takes_every_value_in_the_winning_tier():
    b = RulesetBuilder.zestify()
    b.rule("product", "lime", "Zestify Lime", field="content")
    b.rule("product", "zero", "Zestify Zero", field="content")
    b.rule("product", "bundle", "Zestify Original", field="content", priority=500)   # outranked
    ruleset = b.build()
    outcome = classify([utm(1, content="lime-zero-bundle")], ruleset).get(1, "product")
    assert outcome.status == CLASSIFIED and outcome.method == BY_RULE
    assert values(ruleset, outcome) == ["Zestify Lime", "Zestify Zero"]
    assert [hit.weight for hit in outcome.hits] == [0.5, 0.5]   # spend is split, never counted twice


# ── lenses ──────────────────────────────────────────────────────────────────

def test_an_operators_rules_apply_only_in_its_own_lens():
    b = RulesetBuilder.zestify()
    b.rule("product", "summer", "Zestify Lime", workspace=NORTHGATE)
    ruleset = b.build()
    result = classify(
        [utm(1, campaign="summer", workspace=NORTHGATE), utm(2, campaign="summer", workspace=PINECREST)], ruleset
    )
    assert values(ruleset, result.get(1, "product", WORKSPACE)) == ["Zestify Lime"]
    assert result.get(1, "product", NETWORK).status == UNCLASSIFIED     # the network roll-up never sees it
    assert result.get(2, "product", WORKSPACE).status == UNCLASSIFIED   # and neither does another operator


def test_shared_dimensions_have_only_the_network_lens():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026")
    result = classify([utm(1, campaign="summer")], b.build())
    assert result.get(1, "campaign", NETWORK).status == CLASSIFIED
    assert result.get(1, "campaign", WORKSPACE) is None


def test_an_operator_rule_on_a_shared_dimension_is_refused():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026", workspace=NORTHGATE)
    with pytest.raises(ValueError, match="shared network dimension"):
        classify([utm(1, campaign="summer")], b.build())


# ── product lineups ─────────────────────────────────────────────────────────

def summer_cup_with_lineups():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026")
    b.lineup("Summer Cup 2026", {"Zestify Original": 1, "Zestify Zero": 1, "Zestify Lime": 1})
    b.lineup("Summer Cup 2026", {"Zestify Lime": 3, "Zestify Original": 2}, workspace=NORTHGATE)
    return b


def test_product_follows_the_campaign_lineup_in_each_lens():
    ruleset = summer_cup_with_lineups().build()
    result = classify(
        [utm(1, campaign="summer", workspace=NORTHGATE), utm(2, campaign="summer", workspace=PINECREST)], ruleset
    )
    network = result.get(1, "product", NETWORK)
    assert network.method == BY_LINEUP
    assert values(ruleset, network) == ["Zestify Original", "Zestify Zero", "Zestify Lime"]
    assert [round(hit.weight, 6) for hit in network.hits] == [0.333333] * 3

    northgate = result.get(1, "product", WORKSPACE)
    assert {ruleset.label(v): share for v, share in northgate.allocation} == {
        "Zestify Lime": 0.6,
        "Zestify Original": 0.4,
    }
    pinecrest = result.get(2, "product", WORKSPACE)   # no lineup of its own, so the network's applies
    assert values(ruleset, pinecrest) == values(ruleset, network)


def test_a_product_rule_beats_the_lineup():
    b = summer_cup_with_lineups()
    b.rule("product", "zero", "Zestify Zero", field="content")
    ruleset = b.build()
    outcome = classify([utm(1, campaign="summer", content="zero_sugar_video")], ruleset).get(1, "product")
    assert outcome.method == BY_RULE
    assert values(ruleset, outcome) == ["Zestify Zero"]


def test_no_lineup_without_exactly_one_campaign():
    b = summer_cup_with_lineups()
    b.rule("campaign", "kickoff", "Fall Kickoff 2026")   # ties with "summer" at priority 100
    result = classify([utm(1, campaign="summer kickoff"), utm(2, campaign="newsletter")], b.build())
    assert result.get(1, "campaign").status == CONFLICT
    assert result.get(1, "product").status == UNCLASSIFIED
    assert result.get(2, "product").status == UNCLASSIFIED


# ── explain and preview ─────────────────────────────────────────────────────

def test_explain_shows_what_fired_what_was_outranked_and_what_is_off():
    b = RulesetBuilder.zestify()
    winner = b.rule("campaign", "sc26", "Summer Cup 2026", priority=10)
    outranked = b.rule("campaign", "summer", "Summer Cup 2026", priority=100)
    off = b.rule("campaign", "sc", "Fall Kickoff 2026", priority=1, active=False)
    b.rule("campaign", "kickoff", "Fall Kickoff 2026")   # doesn't match, so not listed
    explained = explain(utm(1, campaign="sc26 summer"), b.build(), "campaign")
    assert [(m.rule.id, m.role) for m in explained] == [
        (off.id, INACTIVE),
        (winner.id, FIRED),
        (outranked.id, SHADOWED),
    ]


def test_explain_names_both_sides_of_a_conflict():
    b = RulesetBuilder.zestify()
    b.rule("campaign", "summer", "Summer Cup 2026")
    b.rule("campaign", "kickoff", "Fall Kickoff 2026")
    assert [m.role for m in explain(utm(1, campaign="summer kickoff"), b.build(), "campaign")] == [CANDIDATE] * 2


def test_preview_lists_the_strings_a_pattern_would_match():
    records = [utm(1, campaign="SC26_launch"), utm(2, campaign="summer cup"), utm(3, content="sc26")]
    assert [r.id for r in preview_rule(records, pattern="sc26", field="campaign")] == [1]
    assert [r.id for r in preview_rule(records, pattern="sc26")] == [1, 3]
    assert [r.id for r in preview_rule(records, pattern="^summer", match_type="regex", field="campaign")] == [2]


# ── the audit and fingerprints ──────────────────────────────────────────────

def test_the_audit_passes_the_engines_own_output():
    b = summer_cup_with_lineups()
    b.rule("campaign", "kickoff", "Fall Kickoff 2026")
    b.rule("product", "zero", "Zestify Zero", workspace=PINECREST)
    b.rule("type", "receipt", "Transactional")
    b.rule("type", "test", action=IGNORE)
    ruleset = b.build()
    records = [
        utm(1, campaign="summer"),
        utm(2, campaign="summer kickoff"),
        utm(3, campaign="receipt test", workspace=PINECREST),
        utm(4, campaign="zero", workspace=PINECREST),
        utm(5),
    ]
    assert audit_result(classify(records, ruleset), ruleset) == []


def test_the_audit_catches_a_silently_broken_tie():
    b = RulesetBuilder.zestify()
    summer = b.rule("campaign", "summer", "Summer Cup 2026")
    kickoff = b.rule("campaign", "kickoff", "Fall Kickoff 2026")
    ruleset = b.build()
    # What an engine that quietly kept both values, or dropped a side, would produce.
    tampered = RunResult(
        ruleset.version_id,
        ENGINE_VERSION,
        (
            Classification(
                1,
                "campaign",
                NETWORK,
                CLASSIFIED,
                BY_RULE,
                (
                    Hit(FIRED, summer.value_id, summer.id, weight=0.5),
                    Hit(FIRED, kickoff.value_id, kickoff.id, weight=0.5),
                ),
            ),
            Classification(2, "campaign", NETWORK, CONFLICT, BY_RULE, (Hit(CANDIDATE, summer.value_id, summer.id),)),
        ),
    )
    problems = audit_result(tampered, ruleset)
    assert any("single-valued dimension holds 2 values" in p for p in problems)
    assert any("at least two candidates" in p for p in problems)


def test_the_audit_catches_an_operator_rule_in_the_network_lens():
    b = RulesetBuilder.zestify()
    own = b.rule("product", "summer", "Zestify Lime", workspace=NORTHGATE)
    ruleset = b.build()
    leaked = RunResult(
        1,
        ENGINE_VERSION,
        (Classification(1, "product", NETWORK, CLASSIFIED, BY_RULE, (Hit(FIRED, own.value_id, own.id, weight=1.0),)),),
    )
    assert any("reached the network lens" in p for p in audit_result(leaked, ruleset))


def test_results_and_fingerprints_are_deterministic():
    ruleset = summer_cup_with_lineups().build()
    records = [utm(i, campaign=text) for i, text in enumerate(["summer", "Summer ", "SUMMER", "other"], start=1)]
    first, second = classify(records, ruleset), classify(list(reversed(records)), ruleset)
    assert first == second
    assert first.fingerprint() == second.fingerprint()
    edited = records[:3] + [utm(4, campaign="summer")]
    assert classify(edited, ruleset).fingerprint() != first.fingerprint()
    assert input_fingerprint(edited) != input_fingerprint(records)


def test_a_raw_string_is_classified_once_per_run():
    with pytest.raises(ValueError, match="appears twice"):
        classify([utm(1), utm(1)], RulesetBuilder.zestify().build())


# ── an independent check on precedence ──────────────────────────────────────

def oracle(record, ruleset, dimension, workspace_id):
    """Precedence written out the slow, obvious way, to hold the engine to."""
    text = NormalizedUtm.of(record).full
    multi_valued = ruleset.dimension(dimension).multi_valued
    matching = [
        rule
        for rule in ruleset.rules
        if rule.active
        and rule.dimension == dimension
        and rule.workspace_id in (None, workspace_id)
        and rule.pattern in text
    ]
    if not matching:
        return UNCLASSIFIED, ()
    best = min(rule.priority for rule in matching)
    winners = {(rule.action, rule.value_id) for rule in matching if rule.priority == best}
    actions = {action for action, _ in winners}
    if len(actions) == 2:
        return CONFLICT, ()
    if actions == {IGNORE}:
        return IGNORED, ()
    assigned = tuple(sorted(value for _, value in winners))
    if len(assigned) > 1 and not multi_valued:
        return CONFLICT, ()
    return CLASSIFIED, assigned


def test_the_engine_agrees_with_a_brute_force_oracle_on_random_rulesets():
    rng = random.Random(20261007)
    tokens = ["sc26", "summer", "cup", "kick", "fall", "rcpt", "remind", "lime", "zero", "fb"]
    for _ in range(150):
        b = RulesetBuilder.zestify()
        for _ in range(rng.randint(1, 12)):
            dimension = rng.choice(["campaign", "product"])
            ignore = rng.random() < 0.1
            b.rule(
                dimension,
                rng.choice(tokens),
                None if ignore else f"{dimension} {rng.randint(1, 3)}",
                action=IGNORE if ignore else "assign",
                priority=rng.choice([10, 20, 30]),   # few levels, so ties are common
                workspace=rng.choice([None, None, NORTHGATE, PINECREST]) if dimension == "product" else None,
                active=rng.random() > 0.1,
            )
        ruleset = b.build()
        records = [
            utm(i, campaign="_".join(rng.sample(tokens, rng.randint(0, 3))), workspace=rng.choice([NORTHGATE, PINECREST]))
            for i in range(1, 30)
        ]
        result = classify(records, ruleset)
        assert audit_result(result, ruleset) == []
        for record in records:
            for dimension, lens, workspace_id in [
                ("campaign", NETWORK, None),
                ("product", NETWORK, None),
                ("product", WORKSPACE, record.workspace_id),
            ]:
                outcome = result.get(record.id, dimension, lens)
                assert (outcome.status, outcome.value_ids) == oracle(record, ruleset, dimension, workspace_id)
