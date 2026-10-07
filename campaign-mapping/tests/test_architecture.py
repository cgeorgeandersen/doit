"""Keeps the engine reusable: no Streamlit anywhere in the package, and no I/O in its pure core."""

import ast
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[1] / "campaign_mapping"
PURE_MODULES = ("normalize", "matching", "models", "engine", "diff")
IO = {
    "sqlite3", "pandas", "streamlit", "os", "io", "pathlib", "shutil", "socket", "urllib", "requests",
    "db", "taxonomy", "rulesets", "runs", "seed",
}


def imported_modules(path: Path) -> set[str]:
    names = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.module is None:   # from . import taxonomy
                names.update(alias.name for alias in node.names)
            else:
                names.add(node.module.split(".")[0])
    return names


def test_nothing_in_the_package_imports_streamlit():
    assert [path.name for path in PACKAGE.glob("*.py") if "streamlit" in imported_modules(path)] == []


@pytest.mark.parametrize("module", PURE_MODULES)
def test_the_engine_modules_touch_no_database_or_files(module):
    assert imported_modules(PACKAGE / f"{module}.py") & IO == set()
