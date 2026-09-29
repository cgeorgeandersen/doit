"""
Make the static fonts the share-image renderer (satori) needs.

Satori can't read woff2 or variable fonts, and the site's Fontsource files
are both. This cuts fixed instances from the same files (Bodoni Moda at its
display optical size, Newsreader at a text size) and copies IBM Plex Mono,
writing them to src/og-fonts/. The results are committed, so this only
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
    ("@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-normal.woff2", {"wght": 500, "opsz": 96}, "bodoni-moda-display-500.ttf"),
    ("@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2", {"wght": 400, "opsz": 36}, "newsreader-400.ttf"),
]

COPIES = [
    ("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff", "ibm-plex-mono-500.woff"),
]

LICENSES = [
    ("@fontsource-variable/bodoni-moda/LICENSE", "LICENSE-bodoni-moda.txt"),
    ("@fontsource-variable/newsreader/LICENSE", "LICENSE-newsreader.txt"),
    ("@fontsource/ibm-plex-mono/LICENSE", "LICENSE-ibm-plex-mono.txt"),
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
