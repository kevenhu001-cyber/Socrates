# Design QA — Cowork-style landing

## Comparison target

- Source visual truth: `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-632f0e28-46bc-4b60-8713-8ca6aeaa5a34.png`
- Follow-up landing reference: `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-8ac28b33-3e6e-45f7-ac53-09c234ef99d8.png`
- Follow-up tool-flow reference: `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-22078607-d50b-4b16-acb8-6560a25bb1df.png`
- Browser-rendered implementation: `C:\Users\Jiacheng\AppData\Local\Temp\socrates-cowork-final-neutral.png`
- Side-by-side comparison: `C:\Users\Jiacheng\AppData\Local\Temp\socrates-cowork-comparison.png`
- Responsive check: `C:\Users\Jiacheng\AppData\Local\Temp\socrates-cowork-mobile-clean.png`

## Normalization

- Source pixels: 3071 × 1815, normalized to a 1536 × 908 CSS-pixel desktop viewport at approximately 2× source density.
- Implementation pixels: 1536 × 908 at deviceScaleFactor 1.
- State: dark-mode landing page, sidebar expanded, empty composer, Cowork mode selected.

## Full-view comparison evidence

- Main title renders at x=795, y=346; the reference title is approximately x=790, y=350.
- Composer keeps its 680px desktop width and is now 113px high after removing the project/folder tier.
- Sidebar is 288px wide in both normalized views.
- The compact composer, Ideas for you label, and three suggestion rows match the requested hierarchy; no project/folder control remains.

## Focused-region comparison evidence

- The title/composer/suggestion stack was readable in the normalized full-view comparison, so a separate crop was not required.
- Interaction evidence: clicking “Send me a daily briefing” populated and focused the topic composer; the neutral state was then restored for final capture.
- Responsive evidence: 894 × 1582 mobile layout showed no clipping, overlap, or horizontal overflow; DOM inspection confirmed zero project/folder rows.
- Browser console: no warnings or errors.
- Tool-flow evidence: a persisted Chinese introduction split at `我先查一下|相关资料。` rendered as one prose block `我先查一下相关资料。`, followed by the tool summary and then `代码验证。`.
- Edit evidence: the write run renders one collapsed summary row; the duplicate `Edited N files / Review changes` card is absent, while clicking the summary still exposes file details.

## Required fidelity surfaces

- Fonts and typography: passed. Newsreader is used for the display title; Inter/Noto Sans SC remain the UI family. Weight, line-height, wrapping, and hierarchy match the reference closely.
- Spacing and layout rhythm: passed. Sidebar width, title/composer coordinates, compact composer dimensions, radius, and suggestion spacing are aligned.
- Colors and visual tokens: passed. Page/sidebar/surface gray levels, subtle borders, muted labels, and selected navigation state match the reference dark palette.
- Image quality and asset fidelity: passed with an intentional brand substitution. The supplied reference’s orange starburst is replaced by the existing sharp Socrates logo asset rather than a CSS or placeholder drawing.
- Copy and content: passed for the app-owned landing surface. “You’re here!”, “Type / for skills”, and all three suggestion labels match the reference; the project/folder option is intentionally removed. Session/account text remains dynamic product data.

## Comparison history

1. Initial implementation used a statistics overview and bottom-docked composer; the user replaced that visual target.
2. First Cowork pass established the two-tier composer and suggestion list but placed the stack about 50px too high, omitted the visible mode switch, and duplicated sidebar labels through compatibility CSS.
3. Fixes moved the stack to the measured reference coordinates, added a real sidebar mode switch, mapped navigation labels directly, and removed time-group noise.
4. Final copy pass changed “Organize my study inbox” to “Organize my inbox” and “Customize Socrates for me” to “Customize Cowork for me”.
5. Follow-up pass removed the project/folder tier, collapsed Edit activity to a single summary row, and made tool insertion sentence-aware for both live and restored turns.

## Findings

- No actionable P0/P1/P2 findings remain.
- P3: the Socrates product logo replaces the reference product’s orange starburst.
- P3: the live product keeps its existing reasoning-effort and microphone controls instead of hard-coding the reference model name and “High” state.
- P3: the sidebar header and account/session data remain Socrates-specific rather than copying another product’s window chrome and fixture content.

## Implementation checklist

- [x] Match normalized desktop geometry.
- [x] Match double-tier composer structure.
- [x] Match Cowork/Code and sidebar navigation hierarchy.
- [x] Match starter suggestion copy and spacing.
- [x] Remove the project/folder option from the landing composer.
- [x] Keep Edit activity to one compact, expandable summary.
- [x] Preserve complete prose sentences before tool rows in live and history views.
- [x] Verify suggestion interaction.
- [x] Verify desktop and mobile rendering with no console errors.
- [x] Pass lint, unit tests, and production build.

final result: passed
