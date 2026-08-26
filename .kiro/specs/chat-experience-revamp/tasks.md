# Implementation Plan: Chat Experience Revamp

## Overview

This plan wires the ChatGPT-style revamp on top of existing, well-tested primitives following the "extend, do not replace" constraint. It advances three tracks — tool-call reliability, input/streaming smoothness, and tool-card/visual design — while preserving all teaching modules.

New pure logic lands as small TypeScript modules (`render/streamScheduler.ts`, `ui/scrollDecision.ts`, `ui/toolCardView.ts`) with paired property/unit coverage; DOM wiring stays in the existing `.js` orchestration (`main.js`, `ui/*.js`, `chat/*.js`). Reliability primitives (`retryPolicy.ts`, `toolRunState.ts`, `streamRetry.ts`) are confirmed via added test coverage rather than rewritten. Each new module is scheduled next to its tests, and Playwright specs cover interaction behavior per Requirement 5.3.

All commands run from `frontend/`. Verify with `npm run lint`, `npm run test:unit`, `npm run build`, and the relevant Playwright specs.

## Tasks

- [x] 1. Reliability track: confirm classification and add property coverage
  - [x] 1.1 Write property tests for retry/abort classification
    - Cover `isRetryableAIError`, `isUserAbort`, and `waitForAIRetry` in `frontend/test/`
    - **Property 1: Transient failures are retryable before semantic output** (nested `status`/`statusCode`/`body.status`)
    - **Property 2: Deterministic provider/config failures are never retryable** (regardless of `semanticActivity`)
    - **Property 3: User abort is classified as user intent and never retried**
    - **Property 4: Retry waits and replays only below the attempt ceiling** (use the `sleep` seam, no real delay)
    - Tag each: **Feature: chat-experience-revamp, Property {n}**
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.6_

  - [x] 1.2 Write property test for tool-run terminal latch
    - Cover `transitionToolRun` over random phase-transition sequences in `frontend/test/`
    - **Property 5: The first terminal phase latches** — later transitions return the same terminal phase unchanged
    - _Requirements: 1.5_

  - [x] 1.3 Extend WASM/TS parity test for tool-run paths
    - Extend `frontend/test/wasmParity.test.mjs` with differential/model-based comparison
    - **Property 6: WASM and TypeScript tool-run paths agree** for `transitionToolRun` and `summarizeToolRuns`
    - _Requirements: 1.6, 5.2_

  - [x] 1.4 Write property test for heartbeat interruption replay
    - Cover `shouldRetryInterruptedStream` across the decision space in `frontend/test/`
    - **Property 7: Heartbeat interruptions replay only before semantic activity** (below max attempts)
    - _Requirements: 1.7_

- [x] 2. Streaming render scheduler
  - [x] 2.1 Implement `render/streamScheduler.ts`
    - Create `createStreamScheduler(paint, now, raf)` with `push` / `flushNow` / `dispose`
    - Coalesce deltas into an accumulator; rAF-gated flush at `getStreamRenderInterval(acc.length)`
    - Inject `now` and `raf` seams for testability
    - _Requirements: 2.1_

  - [x] 2.2 Write property test for repaint cadence
    - **Property 8: Repaint cadence is bounded and non-decreasing in length** — `getStreamRenderInterval` returns a defined tier and is monotonically non-decreasing across tier boundaries
    - _Requirements: 2.1_

  - [x] 2.3 Write property test for incomplete-markdown handling and lossless split
    - Cover `isStableMarkdownPrefix` / `splitStreamingMarkdown` with generators for unbalanced fences, `$$` math, and scaffold tags
    - **Property 10: Incomplete markdown stays in the live tail and splitting is lossless** — unstable constructs stay in the tail; prefix+tail reconstructs the original for any input
    - _Requirements: 2.8_

  - [x] 2.4 Wire the scheduler into the stream loop in `main.js`
    - Replace per-chunk repaint with `scheduler.push(delta)`; call `flushNow()` at turn end
    - `paint(fullText)` splits via `splitStreamingMarkdown` and promotes only when `isStableMarkdownPrefix` holds; unstable tail stays in the live tail
    - _Requirements: 2.1, 2.2, 2.8_

- [x] 3. Auto-scroll decision
  - [x] 3.1 Implement `ui/scrollDecision.ts`
    - Add `SCROLL_SLACK`, `isPinnedToBottom(distanceFromBottom, slack)`, and `shouldAutoScroll(distanceFromBottom, userScrolledAway)` as pure predicates
    - _Requirements: 2.3, 2.4_

  - [x] 3.2 Write property test for auto-scroll decision
    - **Property 9: Auto-scroll happens exactly when pinned and not scrolled away** — true iff within pin slack and no upward intent, over generated geometry and flags
    - _Requirements: 2.3, 2.4_

  - [x] 3.3 Wire the decision into `main.js` / `scroll.js`
    - On each coalesced paint, compute `distanceFromBottom` on `scrollContainer()`, read `state._userScrolledAway`, and call `smoothScrollToBottom()` only when `shouldAutoScroll(...)` is true
    - Keep `scrollPill.js` setting `_userScrolledAway` and showing the "↓ new response" pill; pill click clears the flag and snaps to bottom
    - _Requirements: 2.3, 2.4_

- [x] 4. Stop / Resend controls
  - [x] 4.1 Add Stop / Resend affordances in `main.js` / `chat/stream.js`
    - Show Stop_Action while a turn is in progress; wire click to the turn's `AbortController.abort()` so `isUserAbort` classifies it as user intent (no retry)
    - Finalize the assistant message and settle running tool rows as "stopped" via `settleInlineToolRow`
    - Replace Stop with Resend_Action after stop/finish; Resend re-runs the send path from the most recent user message with a fresh `AbortController`
    - Track `TurnUiState { inProgress, lastUserMessageId }` (non-persisted) to drive visibility
    - _Requirements: 2.5, 2.6, 2.7, 1.3_

  - [x] 4.2 Write unit tests for Stop / Resend visibility and turn control
    - Stop present while a turn is in progress; Resend present after stop
    - Resend starts a new turn from the latest user message
    - _Requirements: 2.5, 2.6, 2.7_

- [x] 5. Checkpoint - Ensure plan-scoped tests pass
  - `npm run lint`, `npm run test:unit` (207/207), `npm run build`, and the plan-scoped Playwright coverage pass. The final full-suite checkpoint remains open for the five unrelated compatibility failures recorded under Task 11.

- [x] 6. Tool card view model and rendering
  - [x] 6.1 Implement `ui/toolCardView.ts`
    - Add `formatDuration(ms)` (ms / `s.s` / `m ss` tiers) and `toolCardView(run, now)` deriving `running`, `phase`, `timeMs`, `timeLabel` from `ToolRun`
    - Terminal: `timeMs = endedAt - startedAt`; running: `timeMs = now - startedAt`; clamp to `>= 0`
    - _Requirements: 3.2, 3.3_

  - [x] 6.2 Write property test for the tool-card view model
    - **Property 13: The tool-card view reflects run phase and reports non-negative time** — running vs terminal `timeMs` semantics, `timeMs >= 0`, `formatDuration` defined and non-decreasing in `timeMs`
    - _Requirements: 3.2, 3.3_

  - [x] 6.3 Wire collapse / running / terminal states in `ui/toolCards.js` / `ui/toolInline.ts`
    - Collapsible: header `button` toggling `aria-expanded` and `data-collapsed`; body shown/hidden via CSS; default collapsed for terminal, expanded while running (3.1)
    - Running: show spinner/shimmer label and a live elapsed timer driven by a single shared ~250ms interval recomputing `toolCardView(run, Date.now())`; stop the interval when no running cards remain (3.2)
    - Terminal: on first terminal phase (already latched), stop the card timer, set terminal phase label + icon, write final total-duration `timeLabel` (3.3)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 6.4 Write unit tests for tool-card collapse and live preview
    - Collapse toggles `aria-expanded` / `data-collapsed`
    - `renderLivePreview` omission markers (edge cases for `liveOutput`)
    - _Requirements: 3.1_

- [x] 7. Tool output and code-block copy affordance
  - [x] 7.1 Add copy control to assistant-message code blocks
    - Reuse the copy-output/copy-code affordance already wired in `toolCards.js`; add a post-render pass in `render/markdown.*` so each fenced code block in assistant output gets a copy button that copies the `code` element's `textContent`
    - Catch clipboard rejection and show a non-fatal "copy failed" state, leaving content intact
    - _Requirements: 3.6_

  - [x] 7.2 Write property tests for tool-output rendering safety and fidelity
    - **Property 11: Tool output never yields executable markup** — `formatToolOutput` escapes every `<`, `>`, `&`, and quote over generated hostile markup
    - **Property 12: JSON output round-trips and fenced code is preserved** — JSON round-trips to a deep-equal value and fenced code content is preserved in escaped form
    - _Requirements: 3.4, 3.5_

- [x] 8. Visual alignment in `styles.css`
  - [x] 8.1 Add ChatGPT-style token layer and rules
    - Add `--chat-*` custom properties and rules for message rhythm/bubbles, code-block header + copy chrome, and tool-card collapsible/running/terminal states
    - Reuse existing `--bg-*` / `--text-*` / `--accent-*` / `--border-*` families so light/dark themes keep working
    - Apply revamped classes to user/assistant message bodies
    - _Requirements: 3.7_

- [x] 9. Teaching capability retention (restyle only)
  - [x] 9.1 Align teaching-module container styling to the new tokens
    - Restyle only the surrounding container (spacing/color/card chrome) for socraticDirectives, tutorSocratic, diagnostic, and visualization dispatch; make no functional/logic changes to the modules
    - Preserve dispatch so scaffold/visualization payloads still route to their modules with unchanged inputs/outputs
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 9.2 Write teaching-module regression tests
    - Fixed inputs yield unchanged parsed outputs; each teaching payload type routes to its module
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 10. Playwright interaction specs (frontend smoke gate)
  - [x] 10.1 Write Playwright spec for input latency during streaming
    - Type into the composer during an active stream; assert the composer value updates within 100ms
    - _Requirements: 2.2, 5.3_

  - [x] 10.2 Write Playwright spec for smooth auto-scroll and scroll-off
    - While streaming, assert the view stays pinned; after an upward gesture, assert auto-scroll stops and the "↓ new response" pill appears; clicking it re-pins
    - _Requirements: 2.3, 2.4, 5.3_

  - [x] 10.3 Write Playwright spec for Stop / Resend
    - Click Stop mid-stream → stream halts and Resend appears; click Resend → a new turn starts from the latest user message
    - _Requirements: 2.6, 2.7, 5.3_

  - [x] 10.4 Write Playwright spec for tool card lifecycle
    - Running card shows a live elapsed timer; on completion shows terminal phase and total duration; header toggles collapse
    - _Requirements: 3.1, 3.2, 3.3, 5.3_

  - [x] 10.5 Write Playwright spec for code-block copy and visual smoke
    - Clicking copy on a code block writes the code content to the clipboard
    - Assert user/assistant messages carry the revamped classes; capture a screenshot for visual review
    - _Requirements: 3.6, 3.7, 5.3_

- [ ] 11. Final checkpoint - Ensure gates pass
  - Ensure `npm run lint`, `npm run test:unit`, and `npm run build` pass; WASM/TS parity suite passes; Playwright smoke specs run. Ask the user if questions arise.
  - Current validation: lint, unit/WASM parity, build, and plan-scoped Playwright tests pass; full smoke is 128/133. Remaining failures are `composer-tools-compat` (Codex action-list expectation), `katex-retry`, two `rn-web-smoke` cases, and the Gmail icon assertion in `sidebar-nav`.
  - _Requirements: 5.1, 5.2, 5.3_

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- The reliability track (Task 1) is confirmation-plus-coverage: the classification logic already satisfies 1.1–1.7, so those sub-tasks add property tests rather than new logic.
- New pure modules (`streamScheduler.ts`, `scrollDecision.ts`, `toolCardView.ts`) are scheduled immediately before the wiring that consumes them, and paired with their property tests.
- Each task references specific requirement sub-clauses for traceability; property tasks additionally cite the design property number.
- Checkpoints (Tasks 5, 11) ensure incremental validation and gate alignment with Requirement 5.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "2.1", "3.1", "6.1", "7.2", "8.1", "9.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "6.2", "6.3", "7.1", "9.2"] },
    { "id": 2, "tasks": ["4.1", "6.4"] },
    { "id": 3, "tasks": ["4.2", "10.1", "10.2", "10.3", "10.4", "10.5"] }
  ]
}
```
