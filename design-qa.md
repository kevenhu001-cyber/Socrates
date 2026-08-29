# Mobile conversation home design QA

- Source visual truth: `/tmp/paseo-attachments-zjtwyL/396d93193b49103b684b1524d48f4fa0979361887e790854e390ed400b3a9c7d.jpg`
- Implementation screenshot: `/tmp/socrates-mobile-reference-implementation.png`
- Combined comparison: `/tmp/socrates-mobile-reference-comparison.png`
- State: authenticated, empty conversation, dark theme, sidebar closed
- CSS viewport: `390 × 756`, device scale factor `1`
- Source pixels: `986 × 2048`; browser chrome removed at source y=137, leaving an app-owned `986 × 1911` region
- Normalization: source app region scaled to `390 × 756`; implementation captured directly at `390 × 756`

## Full-view comparison evidence

The normalized side-by-side comparison shows matching composition: a 56px quiet top bar, empty black content field, two suggestion rows immediately above the composer, a 358px-wide bottom composer, and a 24px bottom safety gutter. The suggestion baselines and composer top/bottom edges align within a few CSS pixels.

No separate focused crop was required because both artifacts remain legible at the normalized 1:1 CSS size in the combined comparison. The top controls, suggestion rows, placeholder, footer controls, border, radius, and bottom gutter can all be judged directly.

## Required fidelity surfaces

- Fonts and typography: UI sans-serif weight, 16px suggestion/input copy, compact 18px top label, line height, truncation, and hierarchy match the reference closely. Socrates keeps its existing localized product copy and Inter/Noto Sans stack.
- Spacing and layout rhythm: top controls, large empty field, suggestion baselines, composer width/top edge, reduced composer height, 30px radius, and 24px bottom gutter match the normalized reference.
- Colors and visual tokens: empty dark state uses true black; composer uses the existing near-black raised surface with restrained gray text and border. Light mode retains its separate warm palette.
- Image quality and asset fidelity: no raster imagery is required inside the app-owned reference region. Existing Socrates vector icons are retained rather than approximating ChatGPT/GitHub brand assets.
- Copy and content: structure and truncation match; Socrates keeps its own suggestions, mode label, effort control, incognito control, and send behavior.

## Findings

No actionable P0, P1, or P2 mismatches remain.

- P3: Product-specific icon and action differences remain intentionally. The reference uses ChatGPT/GitHub-specific imagery and a blue voice action; Socrates keeps its existing navigation, incognito, suggestion, reasoning-effort, microphone, and disabled-send semantics.

## Comparison history

1. Initial implementation: composer was about 12px taller than the normalized reference and had about 12px too little bottom clearance. The suggestion rows were correspondingly high.
2. Fix: reduced the editor/footer/control heights and changed the mobile bottom gutter from 12px to 24px.
3. Post-fix evidence: `/tmp/socrates-mobile-reference-comparison.png` shows the composer top and bottom edges and both suggestion baselines aligned with the normalized source.

## Interaction evidence

- Page identity and authenticated application shell rendered.
- Empty state was non-blank and had no framework overlay.
- Composer focus preserved its geometry and kept effort, microphone, and send controls visible.
- Plus menu opened as the compact five-item mobile popover.
- “Think deeper” toggled and persisted its active indicator.
- No relevant console errors were observed by the visual regression spec.

## Final result

final result: passed
