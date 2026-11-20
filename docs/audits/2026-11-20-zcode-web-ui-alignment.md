# ZCode Web → Socrates UI alignment audit

Date: 2026-11-20. Scope: Socrates PR #183 versus `ZCode/packages/ui` on `main`.

## Reference evidence and scope

- ZCode's [design contract](https://github.com/kevenhu001-cyber/ZCode/blob/main/DESIGN.md): semantic foreground levels, low-contrast backgrounds, 32–40px navigation/action rhythm, reduced emphasis on cards and decoration.
- ZCode [model settings screenshot](https://zcode.z.ai/content/docs/v2/screenshots/apikey-openai-20260611-en.jpg): compact left settings rail, a second provider navigator and a single detail editor.
- ZCode [plugin settings screenshot](https://zcode.z.ai/content/docs/v2/screenshots/plugin-discover-20260701-en.png): panel spacing, low-elevation rows and a hierarchy led by text.
- Implementation references: `packages/ui/src/SettingsPage.tsx`, `settings/SettingsPageParts.tsx`, `settings/model-provider-section/SectionLayout.tsx`, `ToolCallBlocks/ToolSummaryRow.tsx`, `ToolCallBlocks/ToolCallBody.tsx`, `components/ai-elements/reasoning.tsx`, `TaskList.tsx`.
- Socrates's target is **a general AI assistant**, not a coding workbench: ZCode project/workspace navigation, terminal and Git concepts are **not** imported.

The official screenshots show the ZCode product, while PR #183's visual reference suite captures the actual Socrates application from Playwright. Without reviewing both rendered screens at the same viewport, this report does **not** claim pixel-perfect equivalence.

## Findings, severity and code owners

| Surface | Audit finding | Change / decision | Evidence to verify |
| --- | --- | --- | --- |
| Thinking | Socrates already has public-summary filtering, streaming status and an accessible disclosure. Replacing it with an unrelated component risks leaking private reasoning or breaking event order. | Reuse `packages/ui/src/turn/ThinkingSurface.tsx` and `frontend/src/react/tool-run/TurnActivitySurface.tsx`; compact completed bursts. | `thinking-accordion.spec.mjs`, `thinking-panel.spec.mjs`. |
| Tool result | Long output should be secondary, accessible without obscuring generated artifacts and approval/retry. | Add a low-contrast inline rail, bounded scrolling; keep existing source/code/file renderers. | `tool-cards.spec.mjs`, `tool-batch.spec.mjs`; test error and approval. |
| Tool grouping | ZCode has compressed consecutive summary groups, but Socrates previously had one row per call. | Start with batches of 4+ **completed** calls only; leave failures, active work, approvals and agent runs outside. Never discard tool records. | `tool-batch.spec.mjs`; exercise 1, 2, 3 and 5 calls. |
| Sidebar | Visual density, search affordance and keyboard-action discoverability differed. | Tighten recents row rhythm, use search icon and focus-visible menu actions, without replacing `SessionTimeline`. | `sidebar-nav.spec.mjs`, `sidebar-paging.spec.mjs`; screenshots. |
| Session pagination | Already cursor-paged (40 per request) and virtualized above threshold. Reimplementing would create duplicate data/scroll ownership. | **Retain existing logic** and validate >100 chats, pinned and archived. | `sidebar-paging.spec.mjs`. |
| Settings shell | Full-width Settings banner separated navigation from content, unlike ZCode's two-column settings frame. | Move header/back action visually to navigation rail on desktop; retain mobile header and close contract. | Screenshot general/settings desktop and mobile; `settings-modal.spec.mjs`. |
| Provider settings | **Major functional-visual gap**: Socrates rendered all provider cards vertically, ZCode has provider list → focused detail. | Implement independent provider selection rail with one visible editor, independent of which provider is active for chat. Keep other forms mounted to preserve secrets/drafts. | `settings-modal.spec.mjs`: switching, saving, deletion, activation failure, mobile and secrets. |
| Responsive settings | A three-column desktop layout breaks below tablet widths. | At ≤720px, provider navigator becomes a horizontally scrollable strip over one detail editor; existing Settings index/detail navigation remains. | Test at 390px; verify no horizontal page overflow. |
| Themes/typography | ZCode uses its own font and semantic tokens; copying hex/radius values would fight Socrates theme ownership. | Continue with `--ui-*` tokens; use theme-aware surfaces, no new framework, no fixed light/dark HEX. | `zcode-reference-visual.spec.mjs` light/dark captures. |

## Visual QA scenes

Capture these scenes at **1440×900** and **390×844** in both light/dark modes:

1. Sidebar default, hover/focus of conversation row, open context menu, selected row and settings entry.
2. General settings, category hover/selected, empty search, keyboard category traversal, mobile index→detail→back.
3. Model settings with built-in provider, 2 custom providers, unsaved key, errors, disabled external API, select vs activate, save.
4. Single thinking summary, streamed thinking without public summary, thinking with one tool, finished burst, failed tool, approval card and expanded code output.

Inspect text baselines, paddings, whitespace, multi-line behavior, focus rings and page scroll ownership. Visual screenshot attachments from `zcode-reference-visual.spec.mjs` are collected in the Playwright HTML report. Compare against ZCode's official screenshots **manually**; screenshot recording alone is not visual proof.

## Regression invariants

- Public reasoning summaries only; no `reasoning_content` or `<think>` leaks.
- Tool records remain in original chronological order; retries, approvals and errors always accessible.
- Model configuration select-for-edit must not silently activate the selected provider.
- Unsaved password fields persist across provider navigation, categories and Settings reopen; never log or expose their values.
- Tablet and phone do not overflow the viewport or obscure editing buttons.
- Existing list paging, virtual row retention, archive and deletion semantics remain unchanged.
- CI lint (including surface CSS owner checks), build, test:unit and Playwright must be green before merge.

## Residual limitations

- The full ZCode runtime has coding-only tools and desktop-specific panels absent from Socrates; those are **intentional non-parity**, not defects.
- Pixel-fidelity must be evaluated using browser screenshots of both products at matching sizes; remote code inspection cannot establish exact pixel error.
- PR #183 is a focused, safe migration. Further visual cleanup should target tested measured differences, not re-add broad CSS overrides.
