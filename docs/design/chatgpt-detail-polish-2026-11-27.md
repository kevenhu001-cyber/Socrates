# ChatGPT Web detail refinement

Reference: docs/design/chatgpt-web-reference-2026-11-26.md and the supplied phone screenshots. Main c2e5e5e is the starting point. Preserve real functionality, keyboard behavior, theme semantics, brand assets, and Android source. Do not add an override layer or replace visual baselines without reviewing captures.

## Pass 1
- All built-in workflow menu glyphs render through the existing React Icon component on both layouts. Same semantics as the existing extension registry; custom outline glyphs remain outlines, official filled glyphs remain filled. Desktop 18px, phone 22px. Remove SVG-string injection from these Web menu rows, not from unrelated extension token serialization.
- Dark action blue is set to the sampled reference value #3b6fd6 in the existing theme owner; the unmeasured light counterpart and other theme palettes remain unchanged.
- Correct obsolete frame documentation and extend the existing icon browser contract. Actual screenshots and current CI are still required; no pixel-perfect claim.

## Pass 2 — meaningful tool disclosure

Only nonempty public source/file sections, image artifacts and actual agent steps create an expandable row. Approvals retain their independent prompt. Removed the fallback detail which merely repeated the row label; raw logs/arguments/error data remain in the runtime and never become a user-facing detail. A shared public projection drives both the arrow and the body. Keep tests for real search disclosure, keyboard activation, group order and stable UI identities; rewrite old assertions that expected an empty or internal-only detail. No visual baseline changes.
