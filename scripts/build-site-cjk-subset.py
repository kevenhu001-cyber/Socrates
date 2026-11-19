#!/usr/bin/env python3
"""Rebuild the site's self-hosted CJK faces from the pages that use them.

The site paints Chinese prose with two variable Noto Sans SC subsets instead of
Google's 101 unicode-range slices. They carry exactly the code points the pages
ship, so they have to be rebuilt whenever copy changes — the `site-fonts` test
fails when a page uses a code point the committed subsets do not declare.

Why two files: a browser fetches a face only once a character falls through the
earlier families to Noto Sans SC. One combined file meant an English research
page with a single κ (U+03BA) in "κ = 0.78" paid for every ideograph on the
site. Splitting by script keeps that page at ~20 KB and leaves the ideographs
to the pages that actually paint them.

What it writes:

  site/media/fonts/noto-sans-sc-cjk-var.woff2     ideographs + CJK punctuation
  site/media/fonts/noto-sans-sc-latin-var.woff2   latin / greek / symbols
  site/media/fonts/noto-sans-sc-locale-var.woff2  中 / 文 only, for chrome.css
  site/fonts.css                                  the matching unicode-ranges

Usage:

  # one-time: fetch the upstream variable font (17.8 MB, not committed)
  curl -L -o /tmp/NotoSansSC.ttf \\
    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'

  python scripts/build-site-cjk-subset.py --source /tmp/NotoSansSC.ttf

Requires fonttools (`pip install fonttools brotli`). The subsets are variable
(wght 100-900) and keep the default layout features; dropping the axis or the
features changes metrics, so do not.

The unicode-ranges in fonts.css are derived from each built file's own cmap,
never from the requested text: a code point the font has no glyph for (U+25FC,
for one) must stay outside the range so it falls through to the platform CJK
font instead of rendering tofu.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(REPO, "site")
FONTS = os.path.join(SITE, "media", "fonts")
CSS = os.path.join(SITE, "fonts.css")

CJK = os.path.join(FONTS, "noto-sans-sc-cjk-var.woff2")
LATIN = os.path.join(FONTS, "noto-sans-sc-latin-var.woff2")
LOCALE = os.path.join(FONTS, "noto-sans-sc-locale-var.woff2")
LOCALE_CHARS = "中文"

MARKER = "/* noto-sans-sc-cjk-var */"

# Blocks a Latin-only face cannot paint. Everything else in the page set is
# "latin" for this purpose, including the greek κ the research pages cite.
CJK_BLOCKS = [(0x2E80, 0x2FDF), (0x3000, 0x303F), (0x3400, 0x9FFF), (0xF900, 0xFAFF), (0xFF00, 0xFFEF)]


def is_cjk(code):
    return any(from_ <= code <= to for from_, to in CJK_BLOCKS)


def pages_using_fonts_css():
    for root, dirs, files in os.walk(SITE):
        dirs[:] = [d for d in dirs if d != ".git"]
        for name in files:
            if not name.endswith(".html"):
                continue
            path = os.path.join(root, name)
            with open(path, encoding="utf-8") as handle:
                if "fonts.css" in handle.read():
                    yield path


def collect_chars():
    """Every character a page that loads fonts.css can paint.

    Raw page bytes, so attribute values (alt, aria-label, data-question) count
    too — motion.js and chrome.js copy several of them into the DOM. The
    runtime scripts are scanned because they inject consent copy.
    """
    chars = set()
    pages = list(pages_using_fonts_css())
    for path in pages:
        with open(path, encoding="utf-8") as handle:
            chars |= set(handle.read())
    for root, dirs, files in os.walk(SITE):
        dirs[:] = [d for d in dirs if d != ".git"]
        for name in files:
            if name.endswith(".js"):
                with open(os.path.join(root, name), encoding="utf-8") as handle:
                    chars |= set(handle.read())
    return {c for c in chars if c.isprintable()}, pages


def subset(source, text, out):
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(text)
        text_file = handle.name
    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "fontTools.subset",
                source,
                f"--text-file={text_file}",
                "--flavor=woff2",
                "--layout-features=default",
                "--name-IDs=1,2,3,4,5,6",
                "--drop-tables+=DSIG",
                f"--output-file={out}",
            ],
            check=True,
        )
    finally:
        os.unlink(text_file)
    return os.path.getsize(out)


def unicode_range(path):
    """The exact code points the file carries, run-length compressed."""
    font = TTFont(path)
    points = set()
    for table in font["cmap"].tables:
        points |= set(table.cmap)
    runs = []
    for cp in sorted(points):
        if runs and cp == runs[-1][1] + 1:
            runs[-1][1] = cp
        else:
            runs.append([cp, cp])
    parts = [f"U+{a:x}" if a == b else f"U+{a:x}-{b:x}" for a, b in runs]

    lines, current = [], ""
    for part in parts:
        candidate = f"{current},{part}" if current else part
        if len(candidate) > 96:
            lines.append(f"{current},")
            current = part
        else:
            current = candidate
    lines.append(current)
    return "\n             ".join(lines)


def patch_css(ranges):
    with open(CSS, encoding="utf-8") as handle:
        css = handle.read()
    start = css.find(MARKER)
    if start < 0:
        sys.exit(f"{CSS}: missing {MARKER}")
    faces = "".join(
        f"""/* {os.path.splitext(os.path.basename(path))[0]} */
@font-face {{
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(/media/fonts/{os.path.basename(path)}) format('woff2');
  unicode-range: {ranges[path]};
}}

"""
        for path in (CJK, LATIN)
    )
    with open(CSS, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(css[:start] + faces.rstrip("\n") + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="upstream NotoSansSC[wght].ttf")
    args = parser.parse_args()
    if not os.path.exists(args.source):
        sys.exit(f"no such font: {args.source}")

    chars, pages = collect_chars()
    cjk = "".join(sorted(c for c in chars if is_cjk(ord(c))))
    latin = "".join(sorted(c for c in chars if not is_cjk(ord(c))))
    print(f"{len(pages)} pages link fonts.css; {len(chars)} unique characters")
    print(f"  {len(cjk)} CJK, {len(latin)} latin/greek/symbol")

    ranges = {}
    for text, path in ((cjk, CJK), (latin, LATIN)):
        size = subset(args.source, text, path)
        ranges[path] = unicode_range(path)
        print(f"{os.path.basename(path)}: {size / 1024:.1f} KB")
    size = subset(args.source, LOCALE_CHARS, LOCALE)
    print(f"{os.path.basename(LOCALE)}: {size / 1024:.1f} KB")

    patch_css(ranges)
    print(f"{os.path.relpath(CSS, REPO)}: unicode-ranges regenerated")


if __name__ == "__main__":
    main()
