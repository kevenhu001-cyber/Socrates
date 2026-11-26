# ChatGPT Web reference alignment — 2026-11-26

## Scope
Socrates Web and mobile Web only. Preserve the Kotlin Android client, API, persisted data, provider capability rules, streaming runtime and existing brand. The supplied Android ChatGPT screenshots are visual references, not source code or evidence of private ChatGPT implementation details.

Public references: [Apps SDK UI](https://github.com/openai/apps-sdk-ui), [component catalog](https://openai.github.io/apps-sdk-ui/), [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines), [ChatKit](https://github.com/openai/chatkit-js). Use the existing official glyph registry where a matching glyph exists; do not introduce a competing UI library.

## Reference contract
- JPEG samples: dark canvas #0e0e0e, composer #212121, blue user bubble #183e76. Light blue #e3edff is a proposed counterpart, not a measured light screenshot. Keep neutral foreground and surface roles; no decorative gradients.
- Mobile composer: stable two-row composition, provisional 86 CSS px idle height (26 editor + 4 inset + 40 rail + 16 frame), 28px radius, 16px page gutters; one editor instance. Reasoning control uses the actual provider capabilities and existing popover. The primary control remains send/stop; do not add a fictitious voice conversation feature.
- System-first Web typography, bundled CJK and Latin fallbacks; keep user font scaling. Mobile prose 16/26 at default scale.
- Flat assistant messages, 24px user bubble radius, horizontal table separators, unboxed quote blocks, quiet message actions.
- Top/bottom functional scroll fades, existing visualViewport keyboard ownership, no duplicate controller. Compact sidebar navigation and flat settings/connector detail layouts.
- Turn activity remains in the existing expandable surface. Recoverable failures stay in activity; terminal failures remain visible. Citations use the existing validated sources and shared favicon fallback. Generated content uses the same tokens.
- Modify canonical owners rather than stacking new parity layers. Preserve real functionality and accessibility; never update snapshots merely to hide regressions.

## Acceptance gates
Run frontend lint/typecheck/build/unit tests, CSS owner and palette guards, required Playwright tiers, and visual Playwright coverage. Compare at 320/360/390/430/768/1440 CSS px and both themes; check idle, focus, multiline, attachments, tools, model popover, streaming, long transcript, source preview, drawer, settings, plugins, files, projects and authentication. Check real Android Chrome and iOS Safari keyboard behavior. A geometry target is not an observed runtime measurement.

## Implementation status
PR #233 implements palette, typography, mobile composer, greeting, header fade, drawer density, prose/tables, source avatars, settings and plugin detail changes and revises affected assertions. Existing components and CSS owners are reused. Full official-icon migration, remaining CSS/route audit, complete visual snapshots and real-device validation are not yet demonstrated. Local checkout/build is unavailable in the current connector-only environment; CI results must be reviewed before readiness or merge.
