"""
Make the static fonts the share-image renderer (satori) needs.

Satori can't read woff2 or variable fonts, and the site's Fontsource files
are both. This cuts fixed instances from the same files (Bricolage Grotesque at its
display optical size, Instrument Sans at two weights), writing them to
src/og-fonts/. The results are committed, so this only
needs running again if the fonts or their weights change.

    python3 -m pip install fonttools brotli
    python3 scripts/make-og-fonts.py        (run from portfolio/, after npm ci)
"""

from pathlib import Path
import shutil

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
MODULES = ROOT / "node_modules"
OUT = ROOT / "src" / "og-fonts"

INSTANCES = [
    # (source woff2, axis values, output file)
    ("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2", {"wght": 800, "opsz": 96}, "bricolage-grotesque-800.ttf"),
    ("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2", {"wght": 400}, "instrument-sans-400.ttf"),
    ("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2", {"wght": 600}, "instrument-sans-600.ttf"),
]

COPIES = []

LICENSES = [
    ("@fontsource-variable/bricolage-grotesque/LICENSE", "LICENSE-bricolage-grotesque.txt"),
    ("@fontsource-variable/instrument-sans/LICENSE", "LICENSE-instrument-sans.txt"),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source, axes, name in INSTANCES:
        font = instancer.instantiateVariableFont(TTFont(MODULES / source), axes)
        font.flavor = None
        font.save(OUT / name)
        print(f"wrote {name} {axes}")
    for source, name in COPIES + LICENSES:
        shutil.copyfile(MODULES / source, OUT / name)
        print(f"copied {name}")


if __name__ == "__main__":
    main()
