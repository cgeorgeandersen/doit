import pandas as pd
import streamlit as st

import common
from campaign_mapping import reports, taxonomy
from campaign_mapping.diff import compare_results
from campaign_mapping.models import IGNORE, NETWORK
from campaign_mapping.rulesets import diff_versions, list_versions, revert_to_version
from campaign_mapping.runs import list_runs, reproduce_run

conn = common.db()
st.title("Versions")
st.caption(
    "Every change to the rules is a version, and versions never change. Compare any two, see what their rules did to the "
    "results, roll back by making an old version current again, and check that past runs still reproduce exactly."
)
common.show_flash()

versions = list_versions(conn)
history = pd.DataFrame([vars(v) for v in reversed(versions)])
st.dataframe(
    history, hide_index=True, height=min(38 * (len(history) + 1), 320),
    column_config={
        "id": st.column_config.NumberColumn("Version", format="%d", width="small"),
        "parent_id": st.column_config.NumberColumn("Parent", format="%d", width="small"),
        "message": st.column_config.TextColumn("Why it changed", width="large"),
        "author": "Author", "created_at": "When",
        "active_rules": st.column_config.NumberColumn("Active rules", format="%d"),
        "lineup_rows": st.column_config.NumberColumn("Lineup rows", format="%d"),
    },
)

st.subheader("Compare two versions")
ids = [v.id for v in versions]
names = {v.id: f"Version {v.id} · {v.message}" for v in versions}
c1, c2 = st.columns(2)
older = c1.selectbox("From", ids, index=max(0, len(ids) - 2), format_func=names.get, key="v-from")
newer = c2.selectbox("To", ids, index=len(ids) - 1, format_func=names.get, key="v-to")
operators = {w["id"]: w["name"] for w in taxonomy.list_workspaces(conn)}
before, after = common.snapshot(conn, older), common.snapshot(conn, newer)
labels = after.dimension_labels
diff = diff_versions(conn, older, newer)


def show_rule(rule, ruleset) -> str:
    if rule is None:
        return ""
    target = "ignore" if rule.action == IGNORE else ruleset.label(rule.value_id)
    scope = "" if rule.workspace_id is None else f", {operators[rule.workspace_id]} only"
    off = "" if rule.active else ", inactive"
    return f"{rule.match_type} '{rule.pattern}' on {rule.field} → {target} (p{rule.priority}{scope}{off})"


tab_rules, tab_results = st.tabs([f"Rule changes ({len(diff.rules) + len(diff.lineups)})", "What it did to the results"])
with tab_rules:
    if diff.is_empty:
        st.info("These versions contain the same rules and lineups.")
    if diff.rules:
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "change": c.kind, "rule": c.rule_key,
                        "dimension": labels[(c.after or c.before).dimension],
                        "what changed": ", ".join(c.fields),
                        "before": show_rule(c.before, before.ruleset), "after": show_rule(c.after, after.ruleset),
                    }
                    for c in diff.rules
                ]
            ),
            hide_index=True,
            column_config={"before": st.column_config.TextColumn(width="large"),
                           "after": st.column_config.TextColumn(width="large")},
        )
    if diff.lineups:
        st.markdown("**Product lineups**")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "campaign": after.ruleset.label(c.campaign_value_id),
                        "lens": operators.get(c.workspace_id, "Network"),
                        "product": after.ruleset.label(c.product_value_id), "change": c.kind,
                        "share before": c.before_share, "share after": c.after_share,
                    }
                    for c in diff.lineups
                ]
            ),
            hide_index=True,
            column_config={"share before": st.column_config.NumberColumn(format="percent"),
                           "share after": st.column_config.NumberColumn(format="percent")},
        )

with tab_results:
    changes = compare_results(before.result, after.result)
    spend = after.records.set_index("raw_string_id")["spend"]
    rows = []
    for dim in sorted(after.ruleset.dimensions, key=lambda d: d.sort_order):
        a = reports.coverage_by_dimension(before.network, before.ruleset.dimensions).loc[dim.key]
        b = reports.coverage_by_dimension(after.network, after.ruleset.dimensions).loc[dim.key]
        mine = [c for c in changes if c.dimension == dim.key and c.lens == NETWORK]
        rows.append({
            "dimension": dim.label, "spend covered before": a["spend_pct"], "spend covered after": b["spend_pct"],
            "gained": sum(c.kind == "gained" for c in mine), "lost": sum(c.kind == "lost" for c in mine),
            "reassigned": sum(c.kind == "reassigned" for c in mine), "other": sum(c.kind == "restatused" for c in mine),
            "spend moved": float(sum(spend.get(c.raw_string_id, 0.0) for c in mine)),
        })
    st.caption("Network lens, rows of raw strings. Same data on both sides, so every difference comes from the rules.")
    st.dataframe(
        pd.DataFrame(rows), hide_index=True,
        column_config={
            "spend covered before": st.column_config.ProgressColumn(**common.PERCENT),
            "spend covered after": st.column_config.ProgressColumn(**common.PERCENT),
            "spend moved": st.column_config.NumberColumn(format="dollar"),
        },
    )
    if changes:
        strings = after.records.set_index("raw_string_id")[["string", "operator", "spend"]]

        def label(ruleset, allocation, status):
            return " + ".join(ruleset.label(v) for v, _ in allocation) if allocation else f"({status or 'none'})"

        table = pd.DataFrame(
            [
                {
                    "raw_string_id": c.raw_string_id, "dimension": labels[c.dimension],
                    "lens": "network" if c.lens == NETWORK else "operator", "change": c.kind,
                    "before": label(before.ruleset, c.before_allocation, c.before_status),
                    "after": label(after.ruleset, c.after_allocation, c.after_status),
                }
                for c in changes
            ]
        ).join(strings, on="raw_string_id")
        grouped = (
            table.groupby(["string", "dimension", "lens", "change", "before", "after"], sort=False)
            .agg(operator=("operator", "first"), rows=("raw_string_id", "size"), spend=("spend", "sum"))
            .reset_index().sort_values("spend", ascending=False).head(200)
        )
        st.markdown(f"**{len(changes):,} outcomes changed**, biggest spend first")
        st.dataframe(grouped, hide_index=True, column_config={
            "string": st.column_config.TextColumn("String", width="large"),
            "rows": st.column_config.NumberColumn(format="%d"),
            "spend": st.column_config.NumberColumn(format="dollar"),
        })

    if older != ids[-1]:
        st.divider()
        if st.button(f"Make version {older} current again", icon=":material/undo:",
                     help="Writes a new version with exactly version's rules and lineups. Nothing is deleted."):
            new = revert_to_version(conn, older, author=common.user())
            common.flash(f"Version {new}: back to the rules of version {older}." if new else "Already current: nothing changed.")
            st.rerun()

st.subheader("Recorded runs")
runs = list_runs(conn)
if not runs:
    st.info("No runs recorded yet. Record one from the Coverage page.")
else:
    st.dataframe(
        pd.DataFrame([
            {"run": r.id, "version": r.version_id, "engine": r.engine_version, "strings read": r.input_count,
             "watermark": r.max_raw_string_id, "fingerprint": r.result_fingerprint[:16], "by": r.created_by,
             "at": r.created_at, "note": r.note}
            for r in reversed(runs)
        ]),
        hide_index=True,
    )
    left, right = st.columns([1, 3], vertical_alignment="bottom")
    run_id = left.selectbox("Run", [r.id for r in reversed(runs)], key="reproduce-run")
    if right.button("Reproduce it", icon=":material/replay:",
                    help="Re-classify the run's exact input (raw strings up to its watermark) with its exact version, and compare fingerprints."):
        check = reproduce_run(conn, run_id)
        if check.matches:
            st.success(
                f"Run {run_id} reproduces exactly: version {check.version_id}, fingerprint "
                f"`{check.reproduced_fingerprint[:16]}…` matches what was stored.", icon=":material/verified:")
        else:
            st.error(f"Run {run_id} does not reproduce: stored `{check.stored_fingerprint[:16]}…`, now "
                     f"`{check.reproduced_fingerprint[:16]}…` (engine {check.engine_version_then} → {check.engine_version_now}).")
