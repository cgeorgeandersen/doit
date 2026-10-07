"""Campaign Mapping Layer: the Streamlit app.

    streamlit run app/Home.py

Pages live in app/views/. All the logic they show lives in the campaign_mapping
package, which never imports Streamlit.
"""

import streamlit as st

st.set_page_config(page_title="Campaign Mapping Layer", page_icon=":material/account_tree:", layout="wide")

import common  # noqa: E402  (after set_page_config)

pages = {
    "": [st.Page("views/overview.py", title="Overview", icon=":material/space_dashboard:", default=True)],
    "Work the mess": [
        st.Page("views/review.py", title="Review queue", icon=":material/inbox:"),
        st.Page("views/coverage.py", title="Coverage", icon=":material/donut_large:"),
        st.Page("views/rules.py", title="Rules", icon=":material/rule:"),
    ],
    "Data and history": [
        st.Page("views/import_data.py", title="Import", icon=":material/upload_file:"),
        st.Page("views/versions.py", title="Versions", icon=":material/history:"),
        st.Page("views/export.py", title="Export", icon=":material/download:"),
    ],
}
navigation = st.navigation(pages)
common.sidebar()
navigation.run()
