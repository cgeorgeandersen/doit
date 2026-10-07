import pandas as pd
import streamlit as st

import common
from campaign_mapping import reports, taxonomy
from campaign_mapping.matching import FIELDS, MATCH_TYPES, InvalidRule
from campaign_mapping.models import ASSIGN, IGNORE, WORKSPACE
from campaign_mapping.rulesets import DEFAULT_PRIORITY, change_ruleset

conn = common.db()
snap = common.snapshot(conn)
ruleset = snap.ruleset
labels = snap.dimension_labels
operators = {w["id"]: w["name"] for w in taxonomy.list_workspaces(conn)}
operator_ids = {name: id_ for id_, name in operators.items()}

st.title("Rules")
st.caption(
    f"Version {snap.version_id}. Rules are data: each one says on this dimension, if this field matches this pattern, "
    "assign this value. The lowest priority number wins, and a tie that disagrees is a conflict. "
    "Saving any change creates a new version; earlier versions never change."
)
common.show_flash()


def describe(rule) -> str:
    target = "ignore" if rule.action == IGNORE else ruleset.label(rule.value_id)
    scope = "" if rule.workspace_id is None else f" · {operators[rule.workspace_id]} only"
    off = "" if rule.active else " · inactive"
    return f"{rule.rule_key} · {labels[rule.dimension]}: {rule.match_type} '{rule.pattern}' → {target}{scope}{off}"


def rule_form(prefix: str, rule=None) -> dict:
    """Widgets for one rule's fields. Returns the rule as add_rule()/edit_rule() take it."""
    keys = list(labels)
    dimension = st.selectbox("Dimension", keys, format_func=labels.get, key=f"{prefix}-dim",
                             index=keys.index(rule.dimension) if rule else 0, disabled=rule is not None,
                             help="Fixed once a rule exists: a rule for another dimension is a different rule.")
    dim = ruleset.dimension(dimension)
    a, b, c = st.columns(3)
    field = a.selectbox("Field it reads", FIELDS, index=FIELDS.index(rule.field if rule else "campaign"),
                        format_func=lambda f: "all five fields" if f == "any" else f"utm_{f}", key=f"{prefix}-field")
    match_type = b.selectbox("Match type", MATCH_TYPES, index=MATCH_TYPES.index(rule.match_type if rule else "contains"),
                             key=f"{prefix}-match")
    priority = c.number_input("Priority (lower wins)", min_value=0, step=10,
                              value=rule.priority if rule else DEFAULT_PRIORITY, key=f"{prefix}-priority")
    pattern = st.text_input("Pattern", value=rule.pattern if rule else "", key=f"{prefix}-pattern",
                            placeholder="summer cup  ·  or a regex such as summer[ _-]?cup",
                            help="Case, extra spaces and URL-encoded spaces are ignored, for strings and patterns alike. Regex searches anywhere; anchor with ^ and $.")
    d, e = st.columns(2)
    action = d.radio("Action", [ASSIGN, IGNORE], index=1 if rule and rule.action == IGNORE else 0, horizontal=True,
                     format_func=lambda x: "Assign a value" if x == ASSIGN else "Ignore the string", key=f"{prefix}-action")
    value = None
    if action == ASSIGN:
        options = snap.values(dimension)
        current = ruleset.label(rule.value_id) if rule and rule.value_id else None
        value = e.selectbox("Value", options, index=options.index(current) if current in options else None,
                            placeholder="Choose a value", key=f"{prefix}-value")
        added = e.text_input("Or add a new value", key=f"{prefix}-new-value")
        value = added.strip() or value
    f, g = st.columns(2)
    scopes = ["Network"] + (list(operator_ids) if dim.layer == WORKSPACE else [])
    current_scope = operators.get(rule.workspace_id, "Network") if rule else "Network"
    scope = f.selectbox("Scope", scopes, index=scopes.index(current_scope), disabled=len(scopes) == 1,
                        key=f"{prefix}-scope",
                        help="Campaign, objective and type are shared network facts. Product may be attributed per operator.")
    owner = g.text_input("Owner", value=rule.owner if rule else common.user(), key=f"{prefix}-owner")
    note = st.text_input("Note", value=rule.note if rule else "", key=f"{prefix}-note")
    return dict(dimension=dimension, field=field, match_type=match_type, pattern=pattern, action=action, value=value,
                priority=int(priority), workspace=operator_ids.get(scope), owner=owner, note=note)


def test_rule(spec: dict) -> bool:
    """'Test this rule': what the pattern matches right now, before saving."""
    st.markdown("**Test this rule** · what it would match in the current data, before precedence")
    if not spec["pattern"].strip():
        st.caption("Type a pattern to see what it matches.")
        return False
    try:
        totals, sample = reports.rule_reach(snap.records, snap.network, spec["dimension"], field=spec["field"],
                                            match_type=spec["match_type"], pattern=spec["pattern"])
    except InvalidRule as exc:
        st.error(str(exc))
        return False
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Rows", f"{totals['rows']:,}")
    m2.metric("Distinct strings", f"{totals['strings']:,}")
    m3.metric("Spend", common.money(totals["spend"]))
    m4.metric(f"Not yet classified ({labels[spec['dimension']].lower()})", common.money(totals["open_spend"]))
    if totals["rows"]:
        st.dataframe(
            sample.head(15), hide_index=True,
            column_config={
                "string": st.column_config.TextColumn("Matching string", width="large"),
                "operators": "Operators", "rows": st.column_config.NumberColumn("Rows", format="%d"),
                "spend": st.column_config.NumberColumn("Spend", format="dollar"),
                "now": "Value now", "status": "Status now",
            },
        )
    else:
        st.warning("This pattern matches nothing in the current data.")
    return True


tab_all, tab_add, tab_edit, tab_lineups = st.tabs(["All rules", "Add a rule", "Edit a rule", "Product lineups"])

with tab_all:
    f1, f2, f3 = st.columns([1, 1, 2])
    dimension_filter = f1.selectbox("Dimension", ["All", *labels.values()], key="rules-dim-filter")
    state = f2.segmented_control("Show", ["Active", "Inactive", "All"], default="Active", key="rules-state") or "Active"
    search = f3.text_input("Search", placeholder="pattern, value, owner, rule id", key="rules-search")
    frame = pd.DataFrame(
        [
            {
                "rule_key": r.rule_key, "dimension": labels[r.dimension], "field": r.field, "match_type": r.match_type,
                "pattern": r.pattern, "value": "(ignore)" if r.action == IGNORE else ruleset.label(r.value_id),
                "priority": r.priority, "scope": operators.get(r.workspace_id, "Network"), "owner": r.owner,
                "active": r.active, "revision": r.revision, "note": r.note,
            }
            for r in ruleset.rules
        ]
    )
    if dimension_filter != "All":
        frame = frame[frame["dimension"] == dimension_filter]
    if state != "All":
        frame = frame[frame["active"] == (state == "Active")]
    if search:
        needle = search.casefold()
        frame = frame[frame.apply(lambda row: needle in " ".join(map(str, row.values)).casefold(), axis=1)]
    frame = frame.reset_index(drop=True)
    st.caption(f"{len(frame)} rules shown. Priority, owner and active can be edited right in the table; "
               "saving turns every edit into one new version.")
    edited = st.data_editor(
        frame,
        key=f"rules-editor-{snap.version_id}-{dimension_filter}-{state}-{search}",
        hide_index=True,
        height=min(35 * (len(frame) + 1) + 3, 740),
        disabled=[c for c in frame.columns if c not in ("priority", "owner", "active")],
        column_config={
            "rule_key": st.column_config.TextColumn("Rule", width="small"),
            "dimension": "Dimension", "field": "Field", "match_type": "Match",
            "pattern": st.column_config.TextColumn("Pattern", width="medium"),
            "value": "Value", "priority": st.column_config.NumberColumn("Priority", min_value=0, step=1, format="%d"),
            "scope": "Scope", "owner": "Owner", "active": "Active",
            "revision": st.column_config.NumberColumn("Rev", format="%d", width="small"), "note": "Note",
        },
    )
    changes = []
    for before, after in zip(frame.to_dict("records"), edited.to_dict("records"), strict=True):
        diff = {k: after[k] for k in ("priority", "owner", "active") if before[k] != after[k]}
        if diff:
            changes.append((before["rule_key"], diff))
    if changes:
        message = st.text_input("Why are these rules changing?", value=f"Edit {len(changes)} rule(s) in the rules table",
                                key=f"rules-message-{snap.version_id}")
        if st.button(f"Save {len(changes)} change(s) as a new version", type="primary", icon=":material/save:"):
            try:
                with change_ruleset(conn, author=common.user(), message=message) as change:
                    for rule_key, diff in changes:
                        if "priority" in diff:
                            diff["priority"] = int(diff["priority"])
                        if "active" in diff:
                            diff["active"] = bool(diff["active"])
                        change.edit_rule(rule_key, **diff)
                common.flash(f"Version {change.version_id}: {len(changes)} rule(s) changed.")
                st.rerun()
            except (ValueError, LookupError) as exc:
                st.error(str(exc))

with tab_add:
    spec = rule_form("add")
    st.divider()
    testable = test_rule(spec)
    message = st.text_input("Why are you adding it?", key="add-message",
                            value=f"Add {labels[spec['dimension']].lower()} rule: {spec['pattern']} → {spec['value'] or 'ignore'}")
    ready = testable and (spec["action"] == IGNORE or bool(spec["value"]))
    if st.button("Add rule", type="primary", disabled=not ready, icon=":material/add:"):
        if spec["action"] == ASSIGN:
            common.add_value_if_new(conn, spec["dimension"], spec["value"])
        common.write_rule(conn, message=message, **spec)

with tab_edit:
    if not ruleset.rules:
        st.info("No rules yet.")
    else:
        by_key = {r.rule_key: r for r in ruleset.rules}
        rule_key = st.selectbox("Rule", list(by_key), format_func=lambda k: describe(by_key[k]), key="edit-rule")
        rule = by_key[rule_key]
        st.caption(f"Revision {rule.revision}, written {rule.created_at}. Saving writes the next revision in a new "
                   "version; every earlier version keeps this one.")
        spec = rule_form(f"edit-{rule.id}", rule=rule)
        st.divider()
        testable = test_rule(spec)
        message = st.text_input("Why is it changing?", value=f"Edit {rule_key}", key=f"edit-message-{rule.id}")
        save, toggle, _ = st.columns([1, 1, 2])
        if save.button("Save changes", type="primary", disabled=not testable, icon=":material/save:"):
            try:
                if spec["action"] == ASSIGN:
                    common.add_value_if_new(conn, spec["dimension"], spec["value"])
                changes = {k: v for k, v in spec.items() if k != "dimension"}
                with change_ruleset(conn, author=common.user(), message=message) as change:
                    change.edit_rule(rule_key, **changes)
                common.flash(f"Version {change.version_id}: {rule_key} updated." if change.version_id
                             else "Nothing changed, so no new version.")
                st.rerun()
            except (ValueError, LookupError) as exc:
                st.error(str(exc))
        label = "Deactivate" if rule.active else "Reactivate"
        if toggle.button(label, icon=":material/toggle_off:" if rule.active else ":material/toggle_on:"):
            with change_ruleset(conn, author=common.user(), message=f"{label} {rule_key}") as change:
                change.edit_rule(rule_key, active=not rule.active)
            common.flash(f"Version {change.version_id}: {rule_key} {label.lower()}d.")
            st.rerun()

with tab_lineups:
    st.caption(
        "When a string names no product, it takes its campaign's product lineup, split by weight. The network lineup is "
        "shared; an operator's own lineup replaces it for that operator's strings only, and never reaches the network roll-up."
    )
    campaigns = [row["name"] for row in taxonomy.list_campaigns(conn)]
    c1, c2 = st.columns(2)
    campaign = c1.selectbox("Campaign", campaigns, key="lineup-campaign")
    lens = c2.selectbox("Lens", ["Network", *operator_ids], key="lineup-lens")
    campaign_value = taxonomy.value_id(conn, "campaign", campaign)
    workspace = operator_ids.get(lens)
    rows = [r for r in ruleset.campaign_products if r.campaign_value_id == campaign_value and r.workspace_id == workspace]
    frame = pd.DataFrame([{"product": ruleset.label(r.product_value_id), "weight": r.weight} for r in rows],
                         columns=["product", "weight"])
    if workspace is not None and frame.empty:
        network = [r for r in ruleset.campaign_products if r.campaign_value_id == campaign_value and r.workspace_id is None]
        total = sum(r.weight for r in network) or 1
        st.info(f"{lens} has no lineup of its own for {campaign}, so the network's applies: "
                + ", ".join(f"{ruleset.label(r.product_value_id)} {r.weight / total:.0%}" for r in network))
    edited = st.data_editor(
        frame, num_rows="dynamic", hide_index=True, key=f"lineup-{snap.version_id}-{campaign}-{lens}",
        column_config={
            "product": st.column_config.SelectboxColumn("Product", options=snap.values("product"), required=True),
            "weight": st.column_config.NumberColumn("Weight", min_value=0.01, step=0.5, required=True,
                                                    help="Relative: 3 and 2 means 60% and 40%."),
        },
    )
    clean = edited.dropna()
    if len(clean):
        total = float(clean["weight"].sum())
        st.caption("Shares: " + ", ".join(f"{p} {w / total:.0%}" for p, w in zip(clean["product"], clean["weight"], strict=True)))
    message = st.text_input("Why is the lineup changing?", value=f"{lens} lineup for {campaign}", key="lineup-message")
    if st.button("Save lineup as a new version", type="primary", icon=":material/save:"):
        try:
            with change_ruleset(conn, author=common.user(), message=message) as change:
                change.set_lineup(campaign, dict(zip(clean["product"], clean["weight"], strict=True)), workspace=workspace)
            common.flash(f"Version {change.version_id}: lineup saved." if change.version_id else "Nothing changed, so no new version.")
            st.rerun()
        except (ValueError, LookupError) as exc:
            st.error(str(exc))
