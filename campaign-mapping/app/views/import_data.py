import io
from collections import Counter

import pandas as pd
import streamlit as st

import common
from campaign_mapping import taxonomy
from campaign_mapping.runs import existing_hashes, import_prepared, prepare_rows

conn = common.db()
st.title("Import")
st.caption(
    "Bring in UTM strings from a CSV or Excel file. Rows are stored exactly as they arrive, never edited, and every "
    "load is a numbered batch. Classification starts the moment they land."
)
common.show_flash()

TARGETS = {
    "operator": ("Operator", ("operator", "workspace", "bottler", "partner", "account")),
    "utm_source": ("utm_source", ("utm_source", "source")),
    "utm_medium": ("utm_medium", ("utm_medium", "medium")),
    "utm_campaign": ("utm_campaign", ("utm_campaign", "campaign")),
    "utm_content": ("utm_content", ("utm_content", "content")),
    "utm_term": ("utm_term", ("utm_term", "term", "keyword")),
    "spend": ("Spend", ("spend", "cost", "amount")),
    "sends": ("Sends", ("sends", "send_volume", "volume")),
    "activity_date": ("Date", ("activity_date", "date", "day", "week")),
    "source_row": ("Row id", ("row_id", "id", "row")),
}
NONE = "(not in this file)"
ONE_OPERATOR = "(one operator for every row)"

template = pd.DataFrame(columns=["operator", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
                                 "activity_date", "spend", "sends"])
uploaded = st.file_uploader("CSV or Excel (.xlsx) file", type=["csv", "xlsx"])
st.download_button("Download an empty template", template.to_csv(index=False), "utm_import_template.csv",
                   "text/csv", icon=":material/description:")

if uploaded is not None:
    if uploaded.name.lower().endswith(".xlsx"):
        book = pd.ExcelFile(io.BytesIO(uploaded.getvalue()))
        sheet = st.selectbox("Sheet", book.sheet_names) if len(book.sheet_names) > 1 else book.sheet_names[0]
        raw = book.parse(sheet, dtype=str).fillna("")
    else:
        raw = pd.read_csv(io.BytesIO(uploaded.getvalue()), dtype=str, keep_default_na=False, encoding="utf-8-sig")
    st.subheader("1. Map columns")
    st.caption(f"{uploaded.name}: {len(raw):,} rows, {len(raw.columns)} columns. Guesses are filled in; fix any that are wrong.")
    columns = [NONE, *raw.columns]
    lowered = {c.strip().casefold(): c for c in raw.columns}
    mapping = {}
    grid = st.columns(5)
    for i, (target, (label, aliases)) in enumerate(TARGETS.items()):
        guess = next((lowered[a] for a in aliases if a in lowered), NONE)
        options = [ONE_OPERATOR, *columns[1:]] if target == "operator" else columns
        default = guess if guess in options else options[0]
        mapping[target] = grid[i % 5].selectbox(label, options, index=options.index(default), key=f"map-{target}")
    fixed_operator = None
    if mapping["operator"] == ONE_OPERATOR:
        fixed_operator = st.selectbox("Every row is from", [w["name"] for w in taxonomy.list_workspaces(conn)])

    rows = []
    for record in raw.to_dict("records"):
        row = {target: record[column] for target, column in mapping.items() if column not in (NONE, ONE_OPERATOR)}
        if fixed_operator:
            row["operator"] = fixed_operator
        rows.append(row)

    st.subheader("2. Check")
    try:
        prepared = prepare_rows(conn, rows)
    except (ValueError, LookupError) as exc:
        st.error(f"Can't load this file yet: {exc}")
        st.stop()
    counts = Counter(p.row_hash for p in prepared)
    duplicates_in_file = sum(n - 1 for n in counts.values())
    already = existing_hashes(conn, counts)
    already_rows = sum(1 for p in prepared if p.row_hash in already)
    distinct = len({(p.workspace_id, p.utm) for p in prepared})
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Rows", f"{len(prepared):,}")
    m2.metric("Distinct strings", f"{distinct:,}", help="Different operator + UTM combinations.")
    m3.metric("Spend", common.money(sum(p.spend for p in prepared)))
    m4.metric("Duplicate rows in file", f"{duplicates_in_file:,}", help="Rows identical to another row in this file: same operator, UTM, date, spend and sends.")
    m5.metric("Already loaded", f"{already_rows:,}", help="Rows identical to ones imported before. Loading them again would count their spend twice.")
    preview = pd.DataFrame(rows).head(20)
    st.dataframe(preview, hide_index=True)

    st.subheader("3. Load")
    skip_loaded = st.checkbox("Skip rows already loaded", value=True)
    skip_duplicates = st.checkbox("Keep only the first of duplicate rows in this file", value=False,
                                  help="Off by default: two identical rows can be real (the same ad, same day, same spend).")
    chosen, seen = [], set()
    for p in prepared:
        if skip_loaded and p.row_hash in already:
            continue
        if skip_duplicates and p.row_hash in seen:
            continue
        seen.add(p.row_hash)
        chosen.append(p)
    note = st.text_input("Note", placeholder="Q3 export from Pinecrest's ad accounts")
    if st.button(f"Load {len(chosen):,} rows", type="primary", disabled=not chosen, icon=":material/upload:"):
        result = import_prepared(conn, chosen, source_name=uploaded.name, imported_by=common.user(), note=note)
        common.flash(f"Batch {result.batch_id}: {result.rows:,} rows loaded. Coverage and the review queue include them now.")
        st.rerun()

st.subheader("Batches so far")
batches = pd.read_sql_query(
    """SELECT b.id AS batch, b.source_name AS file, b.row_count AS rows, ROUND(SUM(rs.spend), 2) AS spend,
              b.imported_by AS "by", b.imported_at AS "at", b.note
         FROM import_batches b LEFT JOIN raw_strings rs ON rs.batch_id = b.id
        GROUP BY b.id ORDER BY b.id DESC""",
    conn,
)
st.dataframe(batches, hide_index=True,
             column_config={"spend": st.column_config.NumberColumn("Spend", format="dollar")})
