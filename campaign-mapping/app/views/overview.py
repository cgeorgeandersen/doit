import streamlit as st

import common
from campaign_mapping import reports
from campaign_mapping.models import CONFLICT
from campaign_mapping.rulesets import list_versions

conn = common.db()
snap = common.snapshot(conn)

st.title("Campaign Mapping Layer")
st.markdown(
    "A chart of accounts for marketing campaigns, built after the fact from the UTM strings "
    "operators already send. Rules are data, every change to them is a new version, and whatever "
    "the rules can't explain waits in the review queue, biggest spend first."
)
common.show_flash()

view = snap.network
coverage = reports.coverage_by_dimension(view, snap.ruleset.dimensions)
campaign = coverage.loc["campaign"]
conflicted = view[view["status"] == CONFLICT]
versions = list_versions(conn)
current = versions[-1]

c1, c2, c3, c4 = st.columns(4)
c1.metric(
    "Campaign spend covered", common.pct(campaign["spend_pct"]),
    delta=f"{campaign['spend_pct'] - common.TARGET:+.1%} vs the 90% target", delta_color="normal",
    border=True, help="Share of spend whose campaign the rules decide, in the shared network view.",
)
c2.metric("Rows covered", common.pct(campaign["rows_pct"]), border=True,
          help="Share of rows, regardless of spend. Low-spend operational sends weigh as much as big media buys here.")
c3.metric("Conflicts", f"{conflicted['n_any'].nunique():,} strings", border=True,
          help="Strings where rules tie and disagree. They get no value until someone decides; they are never resolved silently.")
c4.metric("Ruleset", f"Version {current.id}", border=True,
          help=f"{current.active_rules} active rules. Every change creates a new version.")

left, right = st.columns([3, 2], gap="large")
with left:
    st.subheader("Coverage by dimension")
    table = coverage.reset_index()[["label", "spend_pct", "conflict_rows", "unclassified_spend"]]
    st.dataframe(
        table,
        hide_index=True,
        column_config={
            "label": "Dimension",
            "spend_pct": st.column_config.ProgressColumn("Spend covered", **common.PERCENT),
            "conflict_rows": st.column_config.NumberColumn("Conflict rows", format="%d"),
            "unclassified_spend": st.column_config.NumberColumn("Unclassified spend", format="dollar"),
        },
    )
    st.caption(
        "Shared view: campaign, objective and type are network facts. Product follows each campaign's "
        "network lineup here; each operator's own attribution is on the Coverage page."
    )

with right:
    st.subheader("Biggest gaps")
    queue = reports.review_queue(view, "campaign", "campaign").head(5)
    if queue.empty:
        st.info("Every campaign string is classified.")
    for item in queue.itertuples():
        st.markdown(f"**`{item.example}`** · {common.money(item.spend)} ({common.pct(item.share)}) · {item.operators}")
    st.page_link("views/review.py", label="Work the review queue", icon=":material/arrow_forward:")

with st.expander("How it works", icon=":material/info:"):
    st.markdown(
        """
1. **Raw strings stay exactly as imported.** Every row keeps its operator, the five UTM fields, a date and its spend.
2. **Rules are data, not code.** A rule says: on this dimension, if this field matches this pattern, assign this
   controlled value, at this priority. The lowest priority number wins.
3. **Ties are conflicts, never guesses.** Two rules at the same priority that disagree leave the string
   unassigned and in the review queue, with both sides shown.
4. **Unknown stays unclassified.** No string falls into a default like "marketing". *Non-campaign* exists
   for strings someone has decided are not campaigns: a decision, not a fallback.
5. **Every change is a version.** Any past result can be rebuilt exactly from its version, and any two versions
   can be compared, rule by rule and string by string.
6. **Operators keep their own lens.** Campaign, type and objective are shared. Each operator may attribute a
   campaign to its own products without changing anyone else's numbers or the network roll-up.
"""
    )
