#!/usr/bin/env python3
"""Build extended self-hosted Noto Sans SC variable slices for the SPA.

The marketing site's noto-sans-sc-{cjk,latin}-var.woff2 covers landing/chrome copy
(~1,330 glyphs). arbitrary AI chat prose needs full modern Chinese coverage so the
browser never falls back to platform/system CJK fonts.

These slices live in frontend/src/assets/fonts/ and are emitted with exact
disjoint unicode-range blocks in frontend/src/styles/foundations/fonts-cjk-ext.css
(imported from foundations/fonts.css? No — appended inside foundations/fonts.css
or imported alongside so NESTED_MANIFESTS and siteFonts.test stay intact!).
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_FONTS_CSS = os.path.join(REPO, "site", "fonts.css")
APP_FONTS_DIR = os.path.join(REPO, "frontend", "src", "assets", "fonts")
APP_FONTS_CSS = os.path.join(REPO, "frontend", "src", "styles", "foundations", "fonts.css")

MARKER_START = "/* BEGIN_EXT_CJK_FACES */"
MARKER_END = "/* END_EXT_CJK_FACES */"


def parse_unicode_range(spec: str) -> set[int]:
    points = set()
    for part in spec.split(","):
        token = part.strip().lstrip("Uu+")
        if not token:
            continue
        if "-" in token:
            a, b = token.split("-", 1)
            for cp in range(int(a, 16), int(b, 16) + 1):
                points.add(cp)
        else:
            points.add(int(token, 16))
    return points


def existing_app_cjk_coverage() -> set[int]:
    with open(SITE_FONTS_CSS, encoding="utf-8") as handle:
        css = handle.read()
    covered = set()
    for match in re.finditer(r"@font-face\s*\{([^}]*)\}", css):
        body = match.group(1)
        if not re.search(r"font-family:\s*['\"]Noto Sans SC['\"]", body):
            continue
        ur = re.search(r"unicode-range:\s*([^;]+);", body)
        if ur:
            covered |= parse_unicode_range(ur.group(1))
    return covered


def encoding_hanzi(enc: str) -> list[int]:
    """Decode all multi-byte code points from a standard CJK charset in order."""
    seen = set()
    ordered = []
    # GB2312 / GBK code space
    for b1 in range(0x81, 0xFF):
        for b2 in range(0x40, 0xFF):
            if b2 == 0x7F:
                continue
            try:
                ch = bytes([b1, b2]).decode(enc)
            except UnicodeDecodeError:
                continue
            if len(ch) != 1:
                continue
            cp = ord(ch)
            if cp not in seen:
                seen.add(cp)
                ordered.append(cp)
    return ordered


def font_cmap(source: str) -> set[int]:
    font = TTFont(source)
    cps = set()
    for table in font["cmap"].tables:
        cps |= set(table.cmap)
    return cps


def subset(source: str, cps: list[int], out: str) -> int:
    text = "".join(chr(cp) for cp in cps)
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


def format_unicode_range(path: str, exclude: set[int]) -> tuple[str, set[int]]:
    cps = sorted(font_cmap(path) - exclude)
    runs = []
    for cp in cps:
        if runs and cp == runs[-1][1] + 1:
            runs[-1][1] = cp
        else:
            runs.append([cp, cp])
    parts = [f"U+{a:x}" if a == b else f"U+{a:x}-{b:x}" for a, b in runs]
    lines, current = [], ""
    for part in parts:
        candidate = f"{current},{part}" if current else part
        if len(candidate) > 92:
            lines.append(f"{current},")
            current = part
        else:
            current = candidate
    if current:
        lines.append(current)
    return "\n    ".join(lines), set(cps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Path to NotoSansSC-VF.ttf")
    args = parser.parse_args()
    if not os.path.exists(args.source):
        sys.exit(f"Missing font source: {args.source}")

    os.makedirs(APP_FONTS_DIR, exist_ok=True)
    source_cps = font_cmap(args.source)
    already_covered = existing_app_cjk_coverage()

    # Punctuation, full-width forms, Kana, Bopomofo, Radicals not in site subset
    punct_ranges = [
        (0x2E80, 0x2FDF),
        (0x3000, 0x30FF),
        (0x3100, 0x312F),
        (0xFE10, 0xFE1F),
        (0xFE30, 0xFE4F),
        (0xFF00, 0xFFEF),
    ]
    extra_punct = [
        cp
        for lo, hi in punct_ranges
        for cp in range(lo, hi + 1)
        if cp in source_cps and cp not in already_covered
    ]

    gb2312_cps = [cp for cp in encoding_hanzi("gb2312") if cp in source_cps and cp not in already_covered]
    # Note: GB2312 puts Level-1 (~3,755 chars) first, then Level-2 (~3,008 chars).
    gb2312_set = set(gb2312_cps) | set(extra_punct) | already_covered
    gbk_extra = [
        cp
        for cp in encoding_hanzi("gbk")
        if cp in source_cps
        and cp not in gb2312_set
        and (0x3400 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF)
    ]

    # Partition into frequency/tier slices (~1,200–2,000 glyphs each, ~250–380 KB per lazy woff2)
    l1_mid = max(1, (len(gb2312_cps) // 2))
    # Split gb2312 roughly into 3 slices (~1,800 each) + punct slice + gbk extra into 6 slices (~2,300 each, <700 KB)
    step = max(1, (len(gb2312_cps) + 2) // 3)
    raw_groups = [
        ("noto-sans-sc-ext-punct-var.woff2", extra_punct),
        ("noto-sans-sc-ext-1-var.woff2", gb2312_cps[0:step]),
        ("noto-sans-sc-ext-2-var.woff2", gb2312_cps[step : 2 * step]),
        ("noto-sans-sc-ext-3-var.woff2", gb2312_cps[2 * step :]),
    ]
    gbk_slices = 6
    gbk_step = max(1, (len(gbk_extra) + gbk_slices - 1) // gbk_slices)
    for idx in range(gbk_slices):
        chunk = gbk_extra[idx * gbk_step : (idx + 1) * gbk_step]
        if chunk:
            raw_groups.append((f"noto-sans-sc-ext-{4 + idx}-var.woff2", chunk))

    blocks = []
    claimed = set(already_covered)
    for filename, cps in raw_groups:
        unique_cps = sorted(set(cps) - claimed)
        if not unique_cps:
            continue
        out_path = os.path.join(APP_FONTS_DIR, filename)
        size = subset(args.source, unique_cps, out_path)
        ur_css, used_cps = format_unicode_range(out_path, claimed)
        claimed |= used_cps
        print(f"{filename}: {len(unique_cps)} chars -> {size / 1024:.1f} KB")
        blocks.append(
            f"@font-face {{\n"
            f"  font-family: 'Noto Sans SC';\n"
            f"  font-style: normal;\n"
            f"  font-weight: 100 900;\n"
            f"  font-display: swap;\n"
            f"  src: url('../../assets/fonts/{filename}') format('woff2');\n"
            f"  unicode-range: {ur_css};\n"
            f"}}"
        )

    with open(APP_FONTS_CSS, encoding="utf-8") as handle:
        css = handle.read()
    body = f"{MARKER_START}\n" + "\n".join(blocks) + f"\n{MARKER_END}"
    if MARKER_START in css and MARKER_END in css:
        css = re.sub(rf"{re.escape(MARKER_START)}.*?{re.escape(MARKER_END)}", body, css, flags=re.S)
    else:
        css = css.rstrip() + "\n\n" + body + "\n"
    with open(APP_FONTS_CSS, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(css)
    print(f"Updated {os.path.relpath(APP_FONTS_CSS, REPO)} with {len(blocks)} extended slices")


if __name__ == "__main__":
    main()
