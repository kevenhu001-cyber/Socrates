# Design Document

## Overview

This design revamps the Socrates conversation experience to match ChatGPT's interaction feel, tool/thinking cards, and visual style. It advances three balanced tracks: tool-call reliability, input/streaming smoothness, and tool-card/overall visual design, while preserving every teaching capability.

The guiding constraint is **extend, do not replace**. The reliability and rendering primitives already exist and are well-tested:

- `chat/retryPolicy.ts` — retry/abort classification and bounded wait.
- `chat/toolRunState.ts` — normalized per-tool run-state machine with WASM + TS parity.
- `chat/liveOutput.ts` — bounded live-output buffer for running tools (WASM + TS parity).
- `render/toolOutput.ts` — XSS-safe rich-text formatter for untrusted tool output.
- `render/streaming.ts` — perceptual repaint cadence, stable-prefix detection, live-tail split.
- `ui/scroll.js` + `ui/scrollPill.js` — velocity-based smooth scroll and scroll-off (pin) detection.
- `ui/toolCards.js` + `ui/toolInline.ts` — tool card / inline row rendering with copy controls.

The revamp adds thin, testable seams on top of these modules (a scroll-decision predicate, an elapsed/duration formatter, a tool-card view model, and CSS tokens), wires the streaming loop to decouple repaint from input, and aligns `styles.css` to the ChatGPT look. No persisted data model changes. No teaching-module logic changes.

### Detected language

The frontend mixes TypeScript (`.ts` primitives) and JavaScript (`.js` orchestration in `main.js`, `ui/`, and the `chat/*.js` wrappers). New pure logic (predicates, formatters, view-model derivation) is added in **TypeScript** alongside the existing `.ts` primitives; DOM wiring stays in the existing `.js` modules. Code examples below use TypeScript for logic and JavaScript for DOM glue, matching the surrounding files.

## Architecture

```
                         ┌──────────────────────────────────────────┐
                         │              main.js (orchestrator)        │
                         │  send / stream loop / turn lifecycle       │
                         └───────┬───────────────┬──────────────┬─────┘
                                 │               │              │
              streaming render   │        turn control          │  teaching dispatch
                                 ▼               ▼              ▼
      ┌───────────────────────────────┐  ┌──────────────────┐  ┌───────────────────┐
      │  render/streaming.ts          │  │ chat/stream.js    │  │ Teaching_Modules  │
      │  getStreamRenderInterval      │  │ agentStream.js    │  │ (unchanged logic, │
      │  splitStreamingMarkdown       │  │ streamRetry.ts    │  │  restyled only)   │
      │  isStableMarkdownPrefix       │  │ retryPolicy.ts    │  └───────────────────┘
      └───────────────┬───────────────┘  └─────────┬────────┘
                      │                            │
        repaint scheduler (rAF + coalesced delta)  │ classify / wait / replay
                      │                            │
                      ▼                            ▼
      ┌───────────────────────────────┐  ┌──────────────────────────┐
      │ ui/scroll.js + scrollPill.js  │  │ chat/toolRunState.ts      │
      │ + scrollDecision.ts (NEW)     │  │ (WASM + TS parity)        │
      │ smooth pin / scroll-off       │  │ transitionToolRun / summary│
      └───────────────────────────────┘  └─────────────┬────────────┘
                                                        │ phase + timestamps
                                                        ▼
                                        ┌───────────────────────────────┐
                                        │ ui/toolCards.js + toolInline.ts│
                                        │ + toolCardView.ts (NEW)        │
                                        │ collapse / running / terminal  │
                                        │ render/toolOutput.ts (escape,  │
                                        │ code/JSON) + liveOutput.ts     │
                                        └───────────────────────────────┘
```

### Design decisions

1. **New logic lands as small pure modules, not edits to hot files.** The `AGENTS.md` guide flags `main.js` as a high-churn surface. New behavior (scroll decision, elapsed formatting, tool-card view model) goes into new `.ts` files with unit + property coverage; `main.js`/`ui/*.js` only gain thin wiring calls. This keeps parity and regression risk isolated to testable units.

2. **Repaint is decoupled from input via a single coalescing scheduler.** Deltas accumulate into a buffer; a `requestAnimationFrame`-gated scheduler flushes at the interval from `getStreamRenderInterval(accumulatedLength)`. Because the flush is rAF-gated and coalesces all pending deltas into one DOM write per tick, keystroke handling on the composer is never starved by per-chunk reflows.

3. **Scroll-off detection stays input-driven (already correct), decision extracted.** `scrollPill.js` already sets `state._userScrolledAway` from wheel/touch/keyboard intent. We extract the *decision* — "should this delta auto-scroll?" — into a pure `shouldAutoScroll()` so it is unit/property testable, and keep the DOM effect (`smoothScrollToBottom`) in `scroll.js`.

4. **Tool cards read from the existing run-state machine.** Collapse, running indicator + elapsed, and terminal + duration all derive from `ToolRun` (`phase`, `startedAt`, `endedAt`). A new `toolCardView.ts` maps a `ToolRun` + current time to a view model; the WASM/TS parity of `toolRunState.ts` is preserved untouched.

5. **Visual alignment is CSS-token driven.** Bubble radius, spacing, surface/border colors, code-block chrome, and copy affordances are expressed as CSS custom properties and class rules in `styles.css`, reusing the existing `--bg-*`, `--text-*`, `--accent-*`, `--border-*` token families so light/dark themes keep working.

## Components and Interfaces

### 1. Tool-call reliability (`retryPolicy.ts`, `toolRunState.ts`, `streamRetry.ts`, `stream.js`)

No new classification logic is needed — the existing functions already cover requirements 1.1–1.7. The design confirms the wiring and adds only test coverage:

- `isRetryableAIError(error, semanticActivity, signal)` — classifies transient transport/5xx/408/425/429 as retryable (1.1); auth/quota/content-policy/invalid-request and other 4xx as non-retryable (1.2); honors user abort (1.3).
- `isUserAbort(error, signal)` — user-stop reasons and bare DOM aborts → user intent (1.3).
- `waitForAIRetry(attempt, error, options)` — returns `true` (wait then retry) only when `attempt < maxAttempts` and the error is retryable, waiting `AI_RETRY_DELAY_MS` via the `sleep` seam (1.4).
- `transitionToolRun(run, nextPhase, patch)` — latches the first terminal phase and ignores later transitions (1.5); routes through WASM when loaded, TS fallback otherwise (1.6).
- `shouldRetryInterruptedStream({ isHeartbeat, semanticActivity, attempt, maxAttempts })` — heartbeat interruption with no semantic activity below max → replay (1.7).

The `stream.js`/`agentStream.js` controllers call these in the send loop; the revamp keeps that flow intact and adds the Stop/Resend affordances (below) as the user-facing entry to `isUserAbort`.

### 2. Streaming render scheduler (`render/streaming.ts` + `main.js` wiring)

`getStreamRenderInterval`, `splitStreamingMarkdown`, and `isStableMarkdownPrefix` already implement the cadence and incomplete-construct handling (2.1, 2.8). The revamp adds a coalescing scheduler in the stream loop:

```typescript
// render/streamScheduler.ts (NEW)
export interface StreamScheduler {
  push(delta: string): void;     // coalesce a network delta
  flushNow(): void;              // force a paint (turn end)
  dispose(): void;
}

export function createStreamScheduler(
  paint: (fullText: string) => void,
  now: () => number = () => Date.now(),
  raf: (cb: () => void) => void = (cb) => requestAnimationFrame(cb),
): StreamScheduler {
  let acc = '';
  let lastPaint = 0;
  let scheduled = false;

  function tick() {
    scheduled = false;
    const interval = getStreamRenderInterval(acc.length);
    if (now() - lastPaint >= interval) {
      lastPaint = now();
      paint(acc);                 // one coalesced DOM write per due tick
    } else {
      schedule();                 // not due yet; re-check next frame
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    raf(tick);
  }
  return {
    push(delta) { acc += delta; schedule(); },
    flushNow() { lastPaint = now(); paint(acc); },
    dispose() { scheduled = false; },
  };
}
```

`paint(fullText)` splits with `splitStreamingMarkdown` and only promotes a prefix when `isStableMarkdownPrefix` holds; the unstable tail (open fence/math/scaffold) stays in the live tail until complete (2.8). Because paints are rAF-gated and coalesced, the composer's keystroke handler runs on frames not occupied by a large reflow, keeping input latency under budget (2.2).

### 3. Auto-scroll decision (`ui/scrollDecision.ts` NEW + `scroll.js`/`scrollPill.js`)

Extract the pin/scroll-off decision into a pure predicate; keep the smooth-scroll effect where it is.

```typescript
// ui/scrollDecision.ts (NEW)
export const SCROLL_SLACK = 64; // px, matches scrollPill.js

export function isPinnedToBottom(distanceFromBottom: number, slack = SCROLL_SLACK): boolean {
  return distanceFromBottom <= slack;
}

/** A streaming delta auto-scrolls only when the reader is pinned AND has
 *  not expressed upward scroll intent. */
export function shouldAutoScroll(distanceFromBottom: number, userScrolledAway: boolean): boolean {
  return isPinnedToBottom(distanceFromBottom) && !userScrolledAway;
}
```

Wiring: on each coalesced paint, `main.js` computes `distanceFromBottom = scrollHeight - scrollTop - clientHeight` on `scrollContainer()`, reads `state._userScrolledAway`, and calls `smoothScrollToBottom()` only when `shouldAutoScroll(...)` is true (2.3, 2.4). `scrollPill.js` continues to set `_userScrolledAway` from wheel/touch/keyboard intent and to show the "↓ new response" pill; the pill click clears the flag and snaps to bottom.

### 4. Stop / Resend controls (`main.js` + `chat/stream.js`)

- **Stop_Action** is shown whenever a turn is in progress (2.5). Clicking it calls the turn's `AbortController.abort()` (no explicit reason), which `isUserAbort` classifies as user intent so the turn is not retried (1.3). The controller finalizes the assistant message and any running tool rows settle as "stopped" via `settleInlineToolRow`.
- **Resend_Action** replaces Stop after a stop/finish (2.6). Clicking it re-runs the send path with the most recent user message (2.7), creating a fresh turn and `AbortController`.

These reuse the existing send/abort plumbing; the revamp adds the two buttons and their state toggle keyed off "turn in progress".

### 5. Tool card view model (`ui/toolCardView.ts` NEW + `ui/toolCards.js`)

```typescript
// ui/toolCardView.ts (NEW)
import { isTerminalToolPhase, type ToolRun } from '../chat/toolRunState.js';

export interface ToolCardView {
  running: boolean;
  phase: string;
  /** ms since startedAt for a running run, or endedAt-startedAt for a terminal run */
  timeMs: number;
  timeLabel: string;   // e.g. "1.4s" / "2m 03s"
}

export function formatDuration(ms: number): string {
  const t = Math.max(0, Math.floor(ms));
  if (t < 1000) return `${t}ms`;
  const s = t / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

export function toolCardView(run: ToolRun, now: number): ToolCardView {
  const terminal = isTerminalToolPhase(run.phase);
  const timeMs = terminal
    ? Math.max(0, (run.endedAt ?? run.startedAt) - run.startedAt)
    : Math.max(0, now - run.startedAt);
  return { running: !terminal, phase: run.phase, timeMs, timeLabel: formatDuration(timeMs) };
}
```

Wiring in `toolCards.js`/`toolInline.ts`:

- **Collapsible** (3.1): the card header is a `button` toggling `aria-expanded` and a `data-collapsed` attribute on the card; the body is shown/hidden via CSS. Default collapsed for terminal runs, expanded while running.
- **Running** (3.2): while `view.running`, show a spinner/shimmer label and a live elapsed timer. A single shared `setInterval` (≈250ms) recomputes `toolCardView(run, Date.now())` for all running cards and writes `timeLabel`; it stops when no running cards remain.
- **Terminal** (3.3): on the first terminal phase (already latched by `transitionToolRun`), stop the timer for that card, set the terminal phase label + icon, and write the final `timeLabel` (total duration).

### 6. Tool output rendering (`render/toolOutput.ts` + `chat/liveOutput.ts`)

Both already satisfy their requirements; the revamp reuses them:

- `formatToolOutput(text)` escapes every byte before `innerHTML` (3.4), and upgrades whole-output fences to highlighted `<pre><code>` and JSON documents to pretty-printed JSON (3.5).
- `createLiveOutputBuffer` + `renderLivePreview` window a running tool's streamed chunks (bounded head/tail) for the running card body.
- **Copy control** (3.6): each rendered code block (in tool output *and* in assistant messages) gets a copy button that copies the `code` element's `textContent` to the clipboard. `toolCards.js` already wires copy-output/copy-code; the revamp adds the same affordance to fenced code blocks in assistant `markdown` output via a post-render pass in `render/markdown.*`.

### 7. Visual alignment (`styles.css`)

Add a ChatGPT-style token layer and rules, reusing existing theme tokens:

```css
:root {
  --chat-bubble-radius: 20px;
  --chat-bubble-pad-y: 10px;
  --chat-bubble-pad-x: 16px;
  --chat-msg-gap: 20px;                 /* vertical rhythm between turns */
  --chat-code-bg: hsl(var(--bg-300));
  --chat-code-radius: 12px;
}

/* Message rhythm + bubbles */
.msg-list { gap: var(--chat-msg-gap); }
.msg.user .msg-body {
  background: hsl(var(--bg-000));
  border-radius: var(--chat-bubble-radius);
  padding: var(--chat-bubble-pad-y) var(--chat-bubble-pad-x);
}
.msg.assistant .msg-body { max-width: 100%; line-height: 1.6; }

/* Code blocks with a header + copy affordance (ChatGPT look) */
.md-code, .agent-tool-output-pre {
  background: var(--chat-code-bg);
  border-radius: var(--chat-code-radius);
  overflow: hidden;
}
.md-code-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; font-size: 12px; color: hsl(var(--text-300));
}
.md-code-copy { /* quiet button; turns accent on success */ }

/* Tool card: collapsible chrome, running shimmer, terminal states */
.agent-tool-card[data-collapsed="1"] .agent-tool-body { display: none; }
.agent-tool-card .agent-tool-time { font-variant-numeric: tabular-nums; color: hsl(var(--text-300)); }
.agent-tool-card[data-state="running"] .agent-tool-label { /* shimmer */ }
.agent-tool-card[data-state="done"]  .agent-tool-icon { color: hsl(var(--accent-000)); }
.agent-tool-card[data-state="error"] .agent-tool-icon { color: hsl(0 70% 55%); }
```

These reuse the `--bg/--text/--accent/--border` families so `[data-theme][data-mode=dark]` continues to work without per-rule overrides where the tokens already adapt.

### 8. Teaching capability retention (`socraticDirectives.js`, `tutorSocratic.js`, diagnostic + visualization modules)

No functional changes. Dispatch stays: a response carrying a teaching scaffold or visualization payload is routed to its module (4.2), which produces the same parsed structures and outputs as before (4.1, 4.3). Only the surrounding container styling (spacing/color/card chrome) is aligned to the new tokens. The stable-prefix scaffold-tag handling in `isStableMarkdownPrefix` already keeps open scaffold blocks in the live tail so restyling does not disturb streaming.

## Data Models

No persisted schema changes. In-memory types used by the new seams:

```typescript
// existing (chat/toolRunState.ts)
interface ToolRun {
  id: string; tool: string; phase: string;
  startedAt: number; endedAt?: number; durationMs?: number; elapsedMs?: number;
}

// new derived, non-persisted (ui/toolCardView.ts)
interface ToolCardView { running: boolean; phase: string; timeMs: number; timeLabel: string; }

// new orchestration state (main.js), non-persisted
interface TurnUiState {
  inProgress: boolean;        // drives Stop vs Resend visibility
  lastUserMessageId: string;  // target of Resend
}
```

## Error Handling

- **Provider failures**: classified by `retryPolicy` (retryable vs terminal). Terminal failures render an assistant error state; retryable failures wait `AI_RETRY_DELAY_MS` and replay up to `AI_MAX_ATTEMPTS` (1.1, 1.2, 1.4).
- **User abort / Stop**: `isUserAbort` prevents retry; running tool rows settle as "stopped"; Resend is offered (1.3, 2.6).
- **Heartbeat interruption**: `shouldRetryInterruptedStream` replays only before semantic activity (1.7).
- **Late tool events**: `transitionToolRun` latches the first terminal phase, so out-of-order/late EventSource frames cannot resurrect a finished run (1.5).
- **Untrusted tool output**: `formatToolOutput` escapes all bytes; malformed JSON falls back to escaped `<pre>` text; oversized JSON is truncated with a marker (3.4, 3.5).
- **Clipboard failures**: copy controls catch rejection and show a non-fatal "copy failed" state, leaving content intact (3.6).
- **Reduced motion**: `smoothScrollToBottom` degrades to an instant snap; the auto-scroll *decision* is unaffected.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transient failures are retryable before semantic output

*For any* error whose status is 408, 425, 429, or in the 500–599 range, when no semantic output has been emitted and the request was not user-aborted, `isRetryableAIError` returns true regardless of how the status is nested (`status`, `statusCode`, or `body.status`).

**Validates: Requirements 1.1**

### Property 2: Deterministic provider/config failures are never retryable

*For any* error whose code or message matches the terminal family (authentication, quota, content-policy, invalid-request) or whose status is a non-retryable 4xx, `isRetryableAIError` returns false regardless of the `semanticActivity` flag.

**Validates: Requirements 1.2**

### Property 3: User abort is classified as user intent and never retried

*For any* aborted signal with a user-stop-like reason or a bare DOM abort, `isUserAbort` returns true and `isRetryableAIError` returns false.

**Validates: Requirements 1.3, 2.6**

### Property 4: Retry waits and replays only below the attempt ceiling

*For any* retryable error and *any* attempt count below `maxAttempts`, `waitForAIRetry` waits the configured delay (via the sleep seam) exactly once and resolves true; for *any* attempt count at or above `maxAttempts`, or *any* non-retryable error, it resolves false without waiting.

**Validates: Requirements 1.4**

### Property 5: The first terminal phase latches

*For any* sequence of phase-transition events, once `transitionToolRun` produces a terminal phase, every subsequent transition on that run returns the same terminal phase unchanged.

**Validates: Requirements 1.5**

### Property 6: WASM and TypeScript tool-run paths agree

*For any* sequence of phase-transition events and *any* set of runs, `transitionToolRun` and `summarizeToolRuns` produce identical phases and summaries whether computed via the WASM path or the TypeScript fallback.

**Validates: Requirements 1.6, 5.2**

### Property 7: Heartbeat interruptions replay only before semantic activity

*For any* interruption decision, `shouldRetryInterruptedStream` returns true exactly when the interruption is a heartbeat, no semantic activity has occurred, and the attempt count is below the maximum.

**Validates: Requirements 1.7**

### Property 8: Repaint cadence is bounded and non-decreasing in length

*For any* non-negative accumulated length, `getStreamRenderInterval` returns one of the defined cadence tiers, and the interval is monotonically non-decreasing as the accumulated length grows across tier boundaries.

**Validates: Requirements 2.1**

### Property 9: Auto-scroll happens exactly when pinned and not scrolled away

*For any* distance-from-bottom and *any* `userScrolledAway` flag, `shouldAutoScroll` returns true if and only if the distance is within the pin slack and the user has not expressed upward scroll intent.

**Validates: Requirements 2.3, 2.4**

### Property 10: Incomplete markdown stays in the live tail and splitting is lossless

*For any* text containing an unbalanced code fence, unbalanced `$$` math, or an unbalanced teaching-scaffold tag, `isStableMarkdownPrefix` returns false and `splitStreamingMarkdown` keeps that construct in the tail; furthermore, for *any* input, concatenating the returned prefix and tail reconstructs the original text.

**Validates: Requirements 2.8**

### Property 11: Tool output never yields executable markup

*For any* tool-output string containing HTML-like markup (e.g. `<script>`, `<img onerror=...>`), the HTML produced by `formatToolOutput` contains no unescaped occurrence of that markup — every `<`, `>`, `&`, and quote from the input is escaped before insertion.

**Validates: Requirements 3.4**

### Property 12: JSON output round-trips and fenced code is preserved

*For any* JSON value `v`, `formatToolOutput(JSON.stringify(v))` is marked rich and its decoded code content parses back to a value deep-equal to `v`; and *for any* code string wrapped in a fence, the output is rich and contains the original code content in escaped form.

**Validates: Requirements 3.5**

### Property 13: The tool-card view reflects run phase and reports non-negative time

*For any* tool run, `toolCardView(run, now)` reports `running=true` with `timeMs = now - startedAt` when the phase is non-terminal, and `running=false` with `timeMs = endedAt - startedAt` when the phase is terminal; in both cases `timeMs >= 0` and `formatDuration(timeMs)` is defined and non-decreasing in `timeMs`.

**Validates: Requirements 3.2, 3.3**

## Testing Strategy

*A property is a characteristic that holds across all valid executions; property tests verify these with randomized inputs (minimum 100 iterations each), while unit tests pin specific examples and edge cases, and Playwright specs verify DOM/interaction behavior.*

### Property-based tests (frontend `test/`, fast-check, ≥100 iterations each)

Each property test is tagged **Feature: chat-experience-revamp, Property {n}: {property text}** and references its design property.

- **Property 1–4** → `retryPolicy` classification and `waitForAIRetry` loop control, using the `sleep` seam so no real delay is incurred.
- **Property 5** → `transitionToolRun` terminal latch over random phase sequences.
- **Property 6** → extend `test/wasmParity.test.mjs`: differential/model-based comparison of WASM vs TS for `transitionToolRun` and `summarizeToolRuns`.
- **Property 7** → `shouldRetryInterruptedStream` over the decision space.
- **Property 8** → `getStreamRenderInterval` monotonicity and tier membership.
- **Property 9** → `shouldAutoScroll` truth table over generated geometry and flags.
- **Property 10** → `isStableMarkdownPrefix` / `splitStreamingMarkdown`; include the prefix+tail reconstruction round-trip and generators that emit unbalanced fences/math/scaffold tags.
- **Property 11** → `formatToolOutput` XSS-safety over generated hostile markup.
- **Property 12** → `formatToolOutput` JSON round-trip (parser/serializer pattern) and fenced-code preservation.
- **Property 13** → `toolCardView` + `formatDuration` over generated runs and clocks.

### Unit / example tests

- Stop button present while a turn is in progress; Resend present after stop (2.5, 2.6).
- Tool-card collapse toggles `aria-expanded`/`data-collapsed` (3.1).
- Teaching-module regression: fixed inputs yield unchanged parsed outputs (4.1, 4.3); each teaching payload type routes to its module (4.2).
- `renderLivePreview` omission markers (edge cases for `liveOutput`).

### Playwright specs (frontend smoke gate, per Requirement 5.3)

- **Input latency**: type into the composer during an active stream; assert the composer value updates within 100ms (2.2).
- **Smooth auto-scroll + scroll-off**: while streaming, assert the view stays pinned; after an upward gesture, assert auto-scroll stops and the "↓ new response" pill appears; clicking it re-pins (2.3, 2.4).
- **Stop / Resend**: click Stop mid-stream → stream halts and Resend appears; click Resend → a new turn starts from the latest user message (2.6, 2.7).
- **Tool card**: running card shows a live elapsed timer; on completion it shows the terminal phase and total duration; header toggles collapse (3.1, 3.2, 3.3).
- **Copy control**: clicking copy on a code block writes the code content to the clipboard (3.6).
- **Visual smoke**: user/assistant messages carry the revamped classes; screenshot for visual review (3.7).

### Quality gates (Requirement 5)

- `npm run lint`, `npm run test:unit`, and `npm run build` pass (5.1).
- WASM/TS parity suite (`test/wasmParity.test.mjs`) passes, including the extended Property 6 checks (5.2).
- Playwright specs above run in the frontend smoke gate and produce failure artifacts on regression (5.3).
