#!/usr/bin/env python3
"""Add -webkit- prefixes to user-select / backdrop-filter / appearance /
scrollbar-width / scrollbar-color in styles.css.

For each rule body `{ ... }`:
  - For every target property declaration `prop: val;` (regardless of
    how many declarations share a line), if no matching
    `-webkit-prop: val;` exists in the same rule, insert one immediately
    before the original declaration (so the prefix comes BEFORE the
    standard property, per webhint css-prefix-order).
  - If a matching prefixed declaration exists but appears AFTER the
    standard one, swap the two so the prefixed version comes first.

This script preserves the original file's line breaks and indentation.
It is idempotent — re-running on an already-migrated file is a no-op.

Usage:
    py scripts/apply-webkit-prefixes.py src/styles.css
"""

import re
import sys
from pathlib import Path

TARGET_PROPS = [
    "user-select",
    "backdrop-filter",
    "appearance",
    "scrollbar-width",
    "scrollbar-color",
]

# A rule is "selector { body }" where body has no nested { or }.
RULE_RE = re.compile(r"([^{}]*?)\{([^{}]*)\}")

# Declaration scanner: finds every target declaration in the body along
# with its byte offsets so we can splice new text in or swap existing
# ranges. Tolerates a trailing `;` and the leading whitespace.
DECL_RE = re.compile(
    r"(?P<lead>\s*)(?P<prefix>-webkit-)?(?P<prop>user-select|backdrop-filter|appearance|scrollbar-width|scrollbar-color)\s*:\s*(?P<val>[^;]+?)\s*(?P<semi>;?)\s*"
)


def find_decls(body: str) -> list[dict]:
    out = []
    for m in DECL_RE.finditer(body):
        out.append({
            "start": m.start(),
            "end": m.end(),
            "lead": m.group("lead"),
            "prefix": m.group("prefix") or "",
            "prop": m.group("prop"),
            "val": m.group("val").strip(),
            "semi": m.group("semi"),
            "match": m.group(0),
        })
    return out


def migrate_rule_body(body: str) -> tuple[str, bool]:
    decls = find_decls(body)
    if not decls:
        return body, False

    # Group by prop, preserving order. We'll iterate the body left-to-right
    # and emit either the original declaration, the prefix declaration, or
    # both — whichever sequence the target rules dictate.
    # Build: dict[prop] -> list of {is_prefix, val}
    grouped: dict[str, list[dict]] = {p: [] for p in TARGET_PROPS}
    for d in decls:
        if d["prop"] not in TARGET_PROPS:
            continue
        grouped[d["prop"]].append({
            "is_prefix": bool(d["prefix"]),
            "val": d["val"],
        })

    # We don't need to know the original offsets for the simple cases —
    # we'll just walk the original body once and emit each prefix / std
    # pair in the correct order.

    # Plan: a stream of "emit" actions interleaved with "passthrough"
    # characters. A "passthrough" is a chunk of the body between two
    # consecutive target declarations.
    plan: list[tuple[str, str]] = []  # (action, text)
    plan.append(("emit", body[0:0]))  # placeholder, real emit happens below

    cursor = 0
    out_parts: list[str] = []
    changed = False

    # For each prop, decide the emit order: prefixed first (if either
    # exists), then standard.
    # Implementation: walk through decls in source order; for each target
    # declaration, look up its position in the grouped list. If this is
    # the first occurrence of this prop and no prefixed version was
    # emitted yet, decide what to emit.

    # Easier: for each target prop that has only an unprefixed declaration,
    # we know we need to emit `-webkit-prop: val;` BEFORE the unprefixed.
    # For each target prop that has BOTH, the prefixed should come first;
    # if source order has prefixed-second, swap.

    # Build a sorted list of (start, end, prop, prefix, val, lead, semi)
    # for every target declaration, in source order.
    decls_sorted = sorted(decls, key=lambda d: d["start"])

    # For each prop, decide the canonical emit text: "PREFIX_VAL | STD_VAL".
    # We'll iterate through the body once, and for every target
    # declaration emit either (prefix if needed) followed by (standard).

    new_body: list[str] = []
    body_pos = 0
    prop_pending_prefix: dict[str, bool] = {p: True for p in TARGET_PROPS}

    for d in decls_sorted:
        prop = d["prop"]
        # Passthrough everything before this declaration.
        new_body.append(body[body_pos:d["start"]])
        body_pos = d["end"]

        # If this is a prefixed declaration, emit it as-is.
        if d["prefix"]:
            new_body.append(d["match"])
            prop_pending_prefix[prop] = False
            continue

        # This is an unprefixed declaration.
        if prop_pending_prefix[prop]:
            # Need to emit the prefixed version FIRST (if we haven't
            # already emitted one for this prop).
            new_body.append(
                f"{d['lead']}-webkit-{prop}: {d['val']}{d['semi'] or ';'}"
            )
            changed = True
        prop_pending_prefix[prop] = False
        new_body.append(d["match"])

    # Trailing text.
    new_body.append(body[body_pos:])
    return "".join(new_body), changed


def transform(text: str) -> tuple[str, int]:
    n = 0
    out: list[str] = []
    cursor = 0
    for m in RULE_RE.finditer(text):
        out.append(text[cursor:m.start()])
        sel, body = m.group(1), m.group(2)
        new_body, changed = migrate_rule_body(body)
        if changed:
            n += 1
            out.append(sel + "{" + new_body + "}")
        else:
            out.append(m.group(0))
        cursor = m.end()
    out.append(text[cursor:])
    return "".join(out), n


def main():
    if len(sys.argv) != 2:
        print("usage: apply-webkit-prefixes.py path/to/styles.css", file=sys.stderr)
        sys.exit(2)
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    new_text, n = transform(text)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        print(f"updated {path}: {n} rule(s) modified")
    else:
        print(f"no changes for {path}")


if __name__ == "__main__":
    main()