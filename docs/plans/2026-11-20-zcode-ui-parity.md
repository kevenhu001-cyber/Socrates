# ZCode Web → Socrates UI migration

Reference: [ZCode Web](https://github.com/kevenhu001-cyber/ZCode/tree/fec975905a2abd4c07e35c40d51fa097a2258ec9/packages/ui/src). Target: Socrates `frontend/src/react` and `packages/ui`.

## Product boundaries

- Reuse the **interaction grammar**, not ZCode's coding-workspace IA. Socrates remains a general assistant.
- Preserve turn event contracts, SSE ordering, approval/error actions, retries, generated artifacts and original transcript content.
- Only provider-exposed public reasoning summaries may appear. Never reconstruct or expose private reasoning.
- Keep RN Web presentation primitives in `packages/ui`; web-only layout and chrome in `frontend/src`.
- Use existing theme tokens; no extra UI framework or shadow copy of tool state.
- Respect the licenses of any reused upstream code. This migration translates existing behavior; it does not copy ZCode source files.

## This PR: first functional design slice

1. **Activity**: provide an expandable aggregate for four or more consecutive *completed* tool calls. Error, approval, running, stopped and agent-managed rows remain individual and visible; expanding reuses the existing `ToolStep` and its details.
2. **Tool details**: apply a single low-contrast nested rail, bounded scroll and consistent spacing.
3. **Sidebar**: align recents search, keyboard-hover affordances and row density with ZCode's calm task list. Keep existing cursor paging and variable-height virtualization.
4. **Settings**: align desktop settings to a compact category rail plus a document-sized preferences column. Preserve existing section routes, state ownership and mobile index/detail navigation.
5. **Regression**: E2E coverage for a completed burst with a failed item.

### Source mapping

| ZCode reference | Socrates owner |
| --- | --- |
| `components/ai-elements/reasoning.tsx` | `packages/ui/src/turn/ThinkingSurface.tsx`, `frontend/src/react/tool-run/TurnActivitySurface.tsx` |
| `ToolCallBlocks/ToolSummaryRow.tsx` | `frontend/src/react/tool-run/TurnActivitySurface.tsx`, `ToolRunDetail.tsx` |
| `ToolCallBlocks/ToolCallBody.tsx` | `packages/ui/src/turn/ToolDetailSheet.tsx` |
| `TaskList.tsx`, `TaskListItem.tsx` | `frontend/src/react/sidebar-chrome`, `react/session-list` |
| `SettingsPage.tsx`, `settings/SettingsPageParts.tsx` | `frontend/src/react/settings`, `styles/polish/settings-page.css` |

## Subsequent PRs

- **Visual parity**: capture real light/dark screenshots of ZCode Web and Socrates at 390, 768, 1024 and 1440px. Resolve typography, rhythm and icons by comparison, not speculative CSS.
- **Tool families**: refine special layouts for code, source search, files, images and agent substeps without changing runtime models or approvals.
- **Sidebar**: improve menu placement and progressive affordances after stress-testing 100+ paged sessions, including retained menu/focus state.
- **Settings**: unify `PreferenceSelect`, provider field rows, responsive controls and empty/error feedback in `packages/ui` where appropriate.
- **Cleanup**: remove superseded style rules only after screenshot and E2E verification; avoid a new overlay layer of `!important` rules.

## Validation checklist

- Run `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint` and `npm --prefix frontend run test:unit`.
- Run `npm --prefix frontend run test:smoke -- --project=regression tool-batch.spec.mjs thinking-accordion.spec.mjs tool-cards.spec.mjs sidebar-paging.spec.mjs settings-modal.spec.mjs` (or the appropriate project filter from Playwright config).
- Verify streaming and settled activities, retries, approvals, code outputs, search sources and failed tools.
- Check responsive and reduced-motion themes; verify keyboard focus, aria-expanded and screen reader labels.
- Compare screenshots before merging. This proposal is source-reviewed; no browser pixel-parity claim is made.
