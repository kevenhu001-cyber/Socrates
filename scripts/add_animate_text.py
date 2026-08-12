"""Add `data-animate-text` to hero h1 tags in editorial pages.

Targets:
- site/<name>.html  (root marketing pages)
- site/zh/<name>.html
- site/research/<slug>/index.html (article hero)

We only touch h1s with the editorial heading classes, and we never
re-tag an element that already has the attribute.
"""
import re
from pathlib import Path

ROOT = Path(r"C:\Users\Jiacheng\Desktop\Socrates\site")
TARGET_CLASSES = ("ed-display", "ed-page-title", "ed-reference-title")

# Pages where the hero h1 should animate. Skip account/checkout/api-keys/profile/privacy/terms
# (functional surfaces), and skip the legal "page-header" titles which are
# already covered by the .ed-reveal fade-up.
SKIP = {"account.html", "checkout.html", "api-keys.html", "profile.html",
        "privacy.html", "terms.html", "favicon.png"}

OPEN = re.compile(
    r"<h1\b(?P<attrs>[^>]*)>", re.IGNORECASE
)

def already_tagged(attrs: str) -> bool:
    return "data-animate-text" in attrs

def has_target_class(attrs: str) -> bool:
    return any(f'"{cls}' in attrs or f' {cls}' in attrs for cls in TARGET_CLASSES)

def upgrade(match: re.Match) -> str:
    attrs = match.group("attrs")
    if already_tagged(attrs) or not has_target_class(attrs):
        return match.group(0)
    return f'<h1{attrs} data-animate-text>'


def process(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    if "data-animate-text" in src:
        return 0
    new = OPEN.sub(upgrade, src)
    if new == src:
        return 0
    path.write_text(new, encoding="utf-8")
    return 1


def main() -> int:
    touched = 0
    for html in sorted(ROOT.rglob("*.html")):
        rel = html.relative_to(ROOT)
        if any(part in SKIP for part in rel.parts):
            continue
        # Skip index.html inside research/<slug>/ — those are article pages
        # whose h1 is the .ed-article-hero h1; they don't have the target
        # class anyway, so they will be naturally skipped.
        result = process(html)
        if result:
            print(f"  + {rel}")
            touched += result
    print(f"\nTotal updated: {touched}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
