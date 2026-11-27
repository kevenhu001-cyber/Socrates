# ChatGPT Web detail refinement

Reference: docs/design/chatgpt-web-reference-2026-11-26.md and the supplied phone screenshots. Main c2e5e5e is the starting point. Preserve real functionality, keyboard behavior, theme semantics, brand assets, and Android source. Do not add an override layer or replace visual baselines without reviewing captures.

## Pass 1
- All built-in workflow menu glyphs render through the existing React Icon component on both layouts. Same semantics as the existing extension registry; custom outline glyphs remain outlines, official filled glyphs remain filled. Desktop 18px, phone 22px. Remove SVG-string injection from these Web menu rows, not from unrelated extension token serialization.
- Dark action blue is set to the sampled reference value #3b6fd6 in the existing theme owner; the unmeasured light counterpart and other theme palettes remain unchanged.
- Correct obsolete frame documentation and extend the existing icon browser contract. Actual screenshots and current CI are still required; no pixel-perfect claim.

## Pass 2 — meaningful tool disclosure

Only nonempty public source/file sections, image artifacts and actual agent steps create an expandable row. Approvals retain their independent prompt. Removed the fallback detail which merely repeated the row label; raw logs/arguments/error data remain in the runtime and never become a user-facing detail. A shared public projection drives both the arrow and the body. Keep tests for real search disclosure, keyboard activation, group order and stable UI identities; rewrite old assertions that expected an empty or internal-only detail. No visual baseline changes.

## Pass 3 — composer stability and accessibility

Keep attachment strip height independent of focus (remove the phone 64px focus override that could clip 64px cards and their scrollbar). Bound long draft scrolling by the visible viewport using the existing normalized keyboard inset, without another viewport listener or controller. Keep the existing 86px empty-frame target and 220px normal maximum. Placeholder truncation is owned by the same rule on desktop and mobile, long unbroken drafts wrap, and the rich editor has an explicit multiline textbox role. Reconcile focus on breakpoint changes, recognize nested editor targets, and use the actual voice/send/stop label for the primary hover title. Add a browser contract with a simulated inherited keyboard inset; actual physical IME and screenshots remain unverified. No native source changes.

## Pass 4 — remaining Web surface detail pass

- Header: unify drawer glyph footprint and neutral hover paint; reserve safe-area insets on both sides of a phone conversation title. Retain the existing measured/provisional header heights rather than inventing new measurements.
- Sidebar: mobile recent actions no longer have a 40% opacity resting state. Keep actual hit targets and route behavior.
- Settings: selected background and row geometry are independent; mobile category names wrap when text is long; header title bounded.
- Directories: desktop project actions appear on card hover and focus; destructive bulk action uses semantic colors; mobile library names remain bounded and use shared type tokens. Plugin title/status layout wraps, neutral secondary descriptions remain readable, and the connection state is available to assistive technology even when hidden visually on narrow viewports. Plugin details wrap long copy and action groups; prompt rows have keyboard-visible hover parity.
- Intelligence UI: numeric value styling is independent of transcript host, full-width tables have one wrapper owner, long choice labels and badges wrap. Auth links provide equivalent focus feedback; reduced-motion also disables root view-transition animation. Shared Page Kit descriptions wrap.
- This is a source-level pass across the remaining named surfaces, not a claim of exhaustive pixel parity. Existing visual baselines remain untouched. Run the browser matrix and inspect screenshots before closing visual acceptance.

### Additional regression coverage

Preserve the header hover selector required by the CSS ownership guard and align the higher-specificity app-shell opener with the 20px glyph contract. Add explicit narrow phone plugin tests in both themes, desktop settings selection geometry checks, and a 320px library name/action collision check. Captures are outputs for inspection, not new golden snapshots.
