import pandas as pd
import streamlit as st

import common
from campaign_mapping import reports, taxonomy
from campaign_mapping.db import connect, utc_now
from campaign_mapping.rulesets import list_versions

conn = common.db()
st.title("Export")
st.caption(
    "The mapping table (every raw string, each dimension's value and the rule that set it) and a roll-up by campaign. "
    "Every file names its ruleset version, so the numbers in it can be rebuilt exactly later."
)
common.show_flash()

history = list_versions(conn)
names = {v.id: f"Version {v.id} · {v.message}" + (" (current)" if v is history[-1] else "") for v in history}
version = st.selectbox("Ruleset version", list(reversed(names)), format_func=names.get, key="export-version",
                       help="Export the current rules, or any past version applied to today's data.")
snap = common.snapshot(conn, version)


@st.cache_data(show_spinner="Building the files…", max_entries=6)
def build(db_path: str, version_id: int, upto: int) -> tuple[pd.DataFrame, pd.DataFrame, bytes, bytes, bytes]:
    data = common._snapshot(db_path, version_id, upto)
    mapping = reports.mapping_table(data.records, data.outcomes, data.ruleset.dimensions,
                                    version_id=version_id, engine_version=data.result.engine_version)
    reader = connect(db_path, check_same_thread=False)
    campaigns = pd.DataFrame([dict(row) for row in taxonomy.list_campaigns(reader)])
    reader.close()
    rollup = reports.campaign_rollup(data.network, data.ruleset, campaigns)
    about = pd.DataFrame(
        [
            ("Ruleset version", version_id),
            ("Engine version", data.result.engine_version),
            ("Raw strings read", f"{len(data.records):,} (ids up to {upto})"),
            ("Result fingerprint", data.result.fingerprint()),
            ("Exported at", utc_now()),
            ("Rebuild", f"Classify raw strings 1–{upto} with ruleset version {version_id}: same fingerprint."),
            ("Data", "Synthetic. Zestify and its operators are fictional."),
        ],
        columns=["", "value"],
    )
    workbook = reports.excel_bytes({"Mapping": mapping, "Campaign roll-up": rollup, "About": about})
    return mapping, rollup, mapping.to_csv(index=False).encode(), rollup.to_csv(index=False).encode(), workbook


mapping, rollup, mapping_csv, rollup_csv, workbook = build(str(common.DB_PATH), snap.version_id, snap.watermark)
stem = f"campaign_mapping_v{snap.version_id}"

c1, c2, c3 = st.columns(3)
c1.download_button("Mapping table (CSV)", mapping_csv, f"{stem}.csv", "text/csv", type="primary",
                   icon=":material/table:", width="stretch")
c2.download_button("Mapping + roll-up (Excel)", workbook, f"{stem}.xlsx",
                   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", icon=":material/grid_on:",
                   width="stretch")
c3.download_button("Campaign roll-up (CSV)", rollup_csv, f"campaign_rollup_v{snap.version_id}.csv", "text/csv",
                   icon=":material/summarize:", width="stretch")

st.subheader("Roll-up by campaign")
st.caption("Network lens. Strings without a campaign stay visible as (unclassified) and (conflict), so the total "
           "always matches the data.")
st.dataframe(
    rollup, hide_index=True,
    column_config={
        "campaign": "Campaign", "start_date": "Starts", "end_date": "Ends", "local_to": "Local to",
        "spend": st.column_config.NumberColumn("Spend", format="dollar"),
        "share": st.column_config.ProgressColumn("Share", **common.PERCENT),
        "rows": st.column_config.NumberColumn("Rows", format="%d"),
        "strings": st.column_config.NumberColumn("Strings", format="%d"),
        "operators": st.column_config.NumberColumn("Operators", format="%d"),
        "network_products": st.column_config.TextColumn("Network product lineup", width="large"),
    },
)

st.subheader("Mapping table")
st.caption(f"{len(mapping):,} rows, one per raw string as imported. Showing the first 500.")
st.dataframe(mapping.head(500), hide_index=True,
             column_config={"spend": st.column_config.NumberColumn("spend", format="dollar")})
