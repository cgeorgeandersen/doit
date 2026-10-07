import streamlit as st

import common
from campaign_mapping import reports, taxonomy
from campaign_mapping.runs import run_classification

conn = common.db()
snap = common.snapshot(conn)
labels = snap.dimension_labels

st.title("Coverage")
st.caption("How much of the data, and how much of the spend, the current rules explain.")
common.show_flash()

operators = {w["slug"]: w["name"] for w in taxonomy.list_workspaces(conn)}
lens_names = {reports.NETWORK_LENS: "Network (shared)", reports.OWN_LENS: "Each operator's own lens", **operators}
lens = st.segmented_control("Lens", list(lens_names), format_func=lens_names.get, default=reports.NETWORK_LENS,
                            key="cov_lens") or reports.NETWORK_LENS
st.caption(
    {
        reports.NETWORK_LENS: "The shared layer every operator accepts: what network roll-ups use. Operators' own product attribution is left out.",
        reports.OWN_LENS: "Every string as its own operator sees it: shared facts, plus that operator's product attribution.",
    }.get(lens, f"Only {lens_names[lens]}'s strings, through its own lens.")
)

view = snap.lens(lens)
coverage = reports.coverage_by_dimension(view, snap.ruleset.dimensions)
campaign = coverage.loc["campaign"]

c1, c2, c3, c4 = st.columns(4)
c1.metric("Campaign spend covered", common.pct(campaign["spend_pct"]), border=True,
          delta=f"{campaign['spend_pct'] - common.TARGET:+.1%} vs 90% target")
c2.metric("Campaign rows covered", common.pct(campaign["rows_pct"]), border=True)
c3.metric("Conflicts (all dimensions)", f"{int(coverage['conflict_rows'].sum()):,} rows", border=True,
          help="Rules that tie and disagree. Never resolved silently: they wait in the review queue.")
c4.metric("Unclassified campaign spend", common.money(campaign["unclassified_spend"]), border=True)

st.subheader("By dimension")
st.dataframe(
    coverage.reset_index()[["label", "spend_pct", "rows_pct", "classified_spend", "conflict_rows",
                            "ignored_rows", "unclassified_rows", "unclassified_spend"]],
    hide_index=True,
    column_config={
        "label": "Dimension",
        "spend_pct": st.column_config.ProgressColumn("Spend covered", **common.PERCENT),
        "rows_pct": st.column_config.ProgressColumn("Rows covered", **common.PERCENT),
        "classified_spend": st.column_config.NumberColumn("Classified spend", format="dollar"),
        "conflict_rows": st.column_config.NumberColumn("Conflict rows", format="%d"),
        "ignored_rows": st.column_config.NumberColumn("Ignored rows", format="%d"),
        "unclassified_rows": st.column_config.NumberColumn("Unclassified rows", format="%d"),
        "unclassified_spend": st.column_config.NumberColumn("Unclassified spend", format="dollar"),
    },
)

if lens in (reports.NETWORK_LENS, reports.OWN_LENS):
    st.subheader("By operator")
    st.caption("Share of each operator's spend classified, each operator seen through its own lens.")
    by_operator = reports.coverage_by_operator(snap.own, snap.ruleset.dimensions).reset_index()
    st.dataframe(
        by_operator,
        hide_index=True,
        column_config={
            "operator": "Operator",
            "Spend": st.column_config.NumberColumn("Spend", format="dollar"),
            **{label: st.column_config.ProgressColumn(label, **common.PERCENT) for label in labels.values()},
        },
    )

st.subheader("Top 20 unrecognized strings")
left, _ = st.columns([1, 3])
dimension = left.selectbox("Dimension", list(labels), format_func=labels.get, key="cov_unrecognized")
top = reports.unrecognized(view, dimension, limit=20)
if top.empty:
    st.info("Nothing unclassified on this dimension.")
else:
    st.dataframe(
        top,
        hide_index=True,
        column_config={
            "rank": st.column_config.NumberColumn("#", format="%d", width="small"),
            "string": st.column_config.TextColumn("String (source / medium / campaign / content / term)", width="large"),
            "operators": "Operators",
            "rows": st.column_config.NumberColumn("Rows", format="%d"),
            "spend": st.column_config.NumberColumn("Spend", format="dollar"),
            "share": st.column_config.ProgressColumn("Share of spend", format="percent", min_value=0.0,
                                                     max_value=max(0.01, float(top["share"].max()))),
        },
    )
    st.page_link("views/review.py", label="Settle these in the review queue", icon=":material/arrow_forward:")

st.subheader("Conflicts")
conflicted = reports.conflicts(view)
if conflicted.empty:
    st.info("No conflicts: no two rules tie and disagree on any string.")
else:
    conflicted["dimension"] = conflicted["dimension"].map(labels)
    st.dataframe(
        conflicted,
        hide_index=True,
        column_config={
            "dimension": "Dimension",
            "string": st.column_config.TextColumn("String", width="large"),
            "candidates": st.column_config.TextColumn("Tied rules", width="large"),
            "operators": "Operators",
            "rows": st.column_config.NumberColumn("Rows", format="%d"),
            "spend": st.column_config.NumberColumn("Spend", format="dollar"),
        },
    )

st.divider()
left, right = st.columns([3, 1], vertical_alignment="center")
left.markdown(
    "**Record this run.** Stores every outcome above with its ruleset version and a fingerprint, so these exact numbers "
    "can be rebuilt and checked later from the Versions page."
)
if right.button("Record run", icon=":material/save:", width="stretch"):
    run_id, result = run_classification(conn, created_by=common.user(), version_id=snap.version_id, note="Recorded from Coverage")
    common.flash(f"Run {run_id} recorded on version {snap.version_id} · fingerprint {result.fingerprint()[:12]}")
    st.rerun()

