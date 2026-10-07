import hashlib

import streamlit as st

import common
from campaign_mapping import reports, taxonomy
from campaign_mapping.matching import MATCH_TYPES, InvalidRule
from campaign_mapping.models import CONFLICT, UNCLASSIFIED, WORKSPACE
from campaign_mapping.normalize import UTM_FIELDS
from campaign_mapping.suggest import suggest

OTHER = "Another value…"
PAGE = 8

conn = common.db()
snap = common.snapshot(conn)
labels = snap.dimension_labels

st.title("Review queue")
st.caption(
    "Strings the rules don't explain yet, biggest spend first. Strings that share a value are one decision. "
    "Every decision writes a rule, so it holds for every future import and lands in a new ruleset version."
)
common.show_flash()

c1, c2, c3 = st.columns([1, 1, 1.4])
dimension = c1.selectbox("Dimension", list(labels), format_func=labels.get, key="rq_dimension")
fields = list(UTM_FIELDS)
field = c2.selectbox(
    "Group strings by",
    fields,
    index=fields.index(reports.REVIEW_FIELD.get(dimension, "campaign")),
    format_func=lambda f: f"utm_{f}",
    key=f"rq_field_{dimension}",
    help="Strings with the same value in this field are reviewed together, and the rule you write reads this field.",
)
show = c3.segmented_control("Show", ["Both", "Unclassified", "Conflicts"], default="Both", key="rq_show") or "Both"
statuses = {"Both": (UNCLASSIFIED, CONFLICT), "Unclassified": (UNCLASSIFIED,), "Conflicts": (CONFLICT,)}[show]

view = snap.network
coverage = reports.coverage_by_dimension(view, snap.ruleset.dimensions).loc[dimension]
queue = reports.review_queue(view, dimension, field, statuses=statuses)
st.progress(
    float(coverage["spend_pct"]),
    text=f"{labels[dimension]} spend covered: **{common.pct(coverage['spend_pct'])}** · "
    f"waiting here: {len(queue):,} values, {common.money(float(queue['spend'].sum()) if len(queue) else 0)}",
)
if queue.empty:
    st.success("Nothing is waiting on this dimension.", icon=":material/done_all:")
    st.stop()

dim = snap.ruleset.dimension(dimension)
examples = reports.classified_examples(view, dimension, field)
values = snap.values(dimension)
operators = {w["name"]: w["slug"] for w in taxonomy.list_workspaces(conn)}


def render(item) -> None:
    uid = hashlib.sha1(f"{dimension}|{field}|{item.key}".encode()).hexdigest()[:12]
    with st.container(border=True):
        head, spend = st.columns([5, 1.3], vertical_alignment="center")
        head.markdown(f"##### {item.rank}. `{item.example or '(empty)'}`")
        head.markdown(
            f"{common.STATUS_BADGE[item.status]} &nbsp; utm_{field} · {item.rows:,} rows · "
            f"{item.strings:,} distinct strings · {item.operators}"
        )
        spend.metric("Spend", common.money(item.spend), delta=f"{common.pct(item.share)} of all",
                     delta_color="off", delta_arrow="off")
        with st.expander("The strings in this group"):
            for sample in item.samples:
                st.code(sample, language=None)
        if item.status == CONFLICT:
            st.warning(f"Rules tie and disagree: {item.candidates}. A rule with a lower priority number settles it.",
                       icon=":material/call_split:")

        suggestions = suggest(item.key, dimension, snap.ruleset, examples)
        options = [s.value for s in suggestions] + [OTHER]
        captions = [f"{s.score:.0f}% match · {s.reason}" for s in suggestions] + ["Choose any value, or add one"]
        choice = st.radio("Assign", options, captions=captions, key=f"choice-{uid}")
        value = choice
        if choice == OTHER:
            pick, new = st.columns(2)
            picked = pick.selectbox("Value", values, index=None, placeholder="Choose a value", key=f"pick-{uid}")
            added = new.text_input("Or add a new value", key=f"new-{uid}",
                                   help="Anyone can add a value to a dimension. A whole new dimension is an admin's call.")
            value = added.strip() or picked

        empty = item.key == ""
        with st.expander("The rule this writes"):
            r1, r2, r3, r4 = st.columns([1, 2, 1, 1.3])
            match_type = r1.selectbox("Match", MATCH_TYPES, index=MATCH_TYPES.index("regex" if empty else "exact"),
                                      key=f"mt-{uid}")
            pattern = r2.text_input("Pattern", value="^$" if empty else item.key, key=f"pat-{uid}")
            priority = r3.number_input("Priority", min_value=0, value=10, step=5, key=f"pri-{uid}",
                                       help="Lower wins. Review decisions use 10, so they settle ties and beat broad patterns.")
            scopes = ["Network"] + (list(operators) if dim.layer == WORKSPACE else [])
            scope = r4.selectbox("Scope", scopes, key=f"scope-{uid}", disabled=len(scopes) == 1,
                                 help="Shared dimensions take network rules only. Product can be attributed per operator.")
            try:
                reach, _ = reports.rule_reach(snap.records, view, dimension, field=field, match_type=match_type, pattern=pattern)
                st.caption(
                    f"Matches {reach['rows']:,} rows ({common.money(reach['spend'])}); "
                    f"{reach['open_rows']:,} of them ({common.money(reach['open_spend'])}) aren't classified yet."
                )
            except InvalidRule as exc:
                st.error(str(exc))
        st.caption(f"Writes: **{match_type}** on utm_{field} = `{pattern}` → **{value or '…'}** · priority {priority}"
                   + ("" if scope == "Network" else f" · {scope} only"))

        go, ignore, _ = st.columns([1, 1, 3])
        workspace = None if scope == "Network" else operators[scope]
        rule = dict(dimension=dimension, field=field, match_type=match_type, pattern=pattern,
                    priority=int(priority), workspace=workspace)
        if go.button("Create rule", type="primary", key=f"go-{uid}", disabled=not value, icon=":material/check:"):
            common.add_value_if_new(conn, dimension, value)
            reason = next((f"suggested, {s.score:.0f}% match: {s.reason}" for s in suggestions if s.value == value), "assigned by hand")
            common.write_rule(conn, message=f"Review queue: {labels[dimension].lower()} '{item.example}' → {value}",
                              value=value, note=f"From the review queue ({reason})", **rule)
        if ignore.button("Mark ignore", key=f"ign-{uid}", icon=":material/block:",
                         help="Writes an ignore rule: the strings leave the queue but don't count as covered."):
            common.write_rule(conn, message=f"Review queue: ignore {labels[dimension].lower()} '{item.example}'",
                              action="ignore", note="Ignored from the review queue", **rule)


limit = st.session_state.get("rq_limit", PAGE)
for item in queue.head(limit).itertuples():
    render(item)
if len(queue) > limit:
    if st.button(f"Show {min(PAGE, len(queue) - limit)} more ({len(queue) - limit} waiting)", icon=":material/expand_more:"):
        st.session_state["rq_limit"] = limit + PAGE
        st.rerun()
