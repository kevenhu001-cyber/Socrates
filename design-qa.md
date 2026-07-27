# Mobile conversation composer design QA

- Collapsed source: `C:\Users\keven\AppData\Local\Temp\codex-clipboard-e92859e3-e26c-4bad-9619-3b861f0bc81b.jpg`
- Focused source: `C:\Users\keven\AppData\Local\Temp\codex-clipboard-67224bd8-39ab-41cc-a96c-993dac4a53d1.jpg`
- Collapsed implementation: `C:\Users\keven\Desktop\Socrates\frontend\test-results\visual-qa\chat-composer-mobile-collapsed.png`
- Focused implementation: `C:\Users\keven\Desktop\Socrates\frontend\test-results\visual-qa\chat-composer-mobile-focused.png`
- Full-state comparison: `C:\Users\keven\Desktop\Socrates\frontend\test-results\visual-qa\design-qa-mobile-states.png`
- Focused component comparison: `C:\Users\keven\Desktop\Socrates\frontend\test-results\visual-qa\design-qa-mobile-composer-focus.png`
- State: mobile dark theme, conversation started, empty composer; collapsed and editor-focused
- Implementation viewport: 390 × 844 CSS px at device scale factor 1
- Source pixels: 1200 × 2439 collapsed and 1200 × 2497 focused
- Implementation pixels: 390 × 844 for both states
- Density normalization: both source images were downsampled to 390 px width. The focused source includes its operating-system keyboard; implementation QA compares only app-owned content because Playwright does not render the device keyboard.

## Full-view comparison

The implementation reproduces the requested state change:

- Unfocused: one compact bottom capsule with add, editor, and terminal action.
- Focused: a taller rounded panel with a maximum-width editor on the first row and add, effort configuration, and terminal action on the second row.
- The composer remains pinned above the normalized mobile keyboard inset.
- Socrates conversation content and header remain intentionally different from the reference product.

## Focused component comparison

A focused region comparison was required because the control alignment and editor width are the central requirements. The normalized comparison confirms that the editor occupies the full inner width in the focused state and that configuration controls move below it without crossing or clipping.

## Required fidelity surfaces

- Fonts and typography: Socrates retains its Inter-based typography. Placeholder and configuration labels remain at mobile-readable 16 px and 12 px sizes with muted hierarchy.
- Spacing and layout rhythm: collapsed height is at most 66 px; focused height is at least 110 px. Focused editor width is within 20 px of the outer composer width. Rounded corners and bottom control spacing follow the reference.
- Colors and visual tokens: the layout follows the reference while retaining Socrates dark/light tokens and gold focus indication.
- Image quality and asset fidelity: the requested composer contains no raster content. Existing product icons are preserved; no placeholder art was introduced.
- Copy and content: Socrates keeps “Send a message” and its existing effort labels rather than copying ChatGPT-specific model names.

## Comparison history

### Iteration 1

- Earlier finding [P2]: the focused editor visually expanded but still flex-shrank to roughly 300 px, so the lower controls were taking horizontal space from the input.
- Fix: moved the editor to its own flex row and changed focused sizing to an explicit full-width basis.

### Iteration 2

- Earlier finding [P2]: `flex-basis: 100%` still allowed shrinking under the existing flex rules.
- Fix: added matching `width`, `min-width`, and `max-width` constraints at 100%.
- Post-fix evidence: `design-qa-mobile-composer-focus.png` shows the focused editor spanning the complete inner width while configuration remains below.

## Findings

No actionable P0, P1, or P2 differences remain for the requested mobile composer states.

- [P3] Voice controls intentionally differ.
  - Location: right side of both composer states.
  - Evidence: the source contains separate microphone and voice-mode buttons; Socrates retains its existing functional send/stop control.
  - Rationale: adding non-functional voice affordances would imply unsupported behavior.

## Primary interactions checked

- Editor focus expands the composer.
- Editor blur collapses the composer.
- Effort configuration appears only in the focused mobile state.
- The editor receives the full focused row.
- Mobile send remains pinned after submission.
- Virtual-keyboard inset normalization remains correct.
- Desktop composer remains compact and unchanged.
- No Playwright page errors in the covered flow.

## Implementation checklist

- [x] Unfocused mobile composer remains a compact capsule.
- [x] Focused composer expands smoothly into two rows.
- [x] Editor receives the maximum available width.
- [x] Attachment and effort controls move below the editor.
- [x] Blur returns the composer to its compact state.
- [x] Typecheck, unit tests, production build, keyboard tests, chat-send tests, and visual tests pass.

final result: passed
