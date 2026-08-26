# Requirements Document

## Introduction

This feature revamps the Socrates conversation experience to match the interaction feel, tool/thinking cards, and overall visual style of ChatGPT. Work advances along three balanced tracks with equal priority: tool-call reliability (retry, abort, and state consistency), input and streaming smoothness (typewriter cadence, smooth auto-scroll, Stop/resend, input lag fixes), and tool-card and overall visual design (collapsible cards, running/complete state with elapsed time, message bubbles, spacing, color, code blocks, and copy buttons).

The revamp extends existing assets rather than replacing them: the retry/abort classification in `retryPolicy.ts`, the tool run-state machine in `toolRunState.ts` (with its WASM + TypeScript dual-path parity), the bounded live output buffer in `liveOutput.ts`, and the XSS-safe rich-text renderer in `toolOutput.ts`. All existing teaching capabilities (socraticDirectives, tutorSocratic, diagnostic, visualization) are retained; only their visual presentation and experience are aligned to the ChatGPT style. Primary touched surfaces include `frontend/src/main.js`, the `chat/` modules, the `render/` modules, and `styles.css`.

## Glossary

- **Chat_UI**: The frontend conversation surface rendered from `frontend/src/main.js` and its extracted `chat/` and `render/` modules, including the message list, input composer, and tool cards.
- **Input_Composer**: The message input area of the Chat_UI where a user types and submits a message.
- **Stream_Renderer**: The streaming-render component in `render/streaming.ts` that coalesces incoming deltas and paints assistant text at a perceptual cadence.
- **Tool_Card**: The Chat_UI element that displays a single tool invocation, its phase, its elapsed time, and its output.
- **Tool_Run_State**: The normalized per-tool run-state machine in `chat/toolRunState.ts`, with WASM and TypeScript paths that must produce identical output.
- **Retry_Policy**: The shared retry/abort classification and wait logic in `chat/retryPolicy.ts`.
- **Stream_Controller**: The streaming lifecycle logic in `chat/stream.js`, `chat/agentStream.js`, and `chat/streamRetry.ts` that manages sending, interruption, retry, and stop.
- **Live_Output_Buffer**: The bounded live-output buffer in `chat/liveOutput.ts` that windows a running tool's streamed chunks.
- **Tool_Output_Renderer**: The XSS-safe rich-text formatter in `render/toolOutput.ts` that renders untrusted tool output.
- **Teaching_Modules**: The retained teaching capabilities implemented by `chat/socraticDirectives.js`, `tutorSocratic.js`, the diagnostic modules (`chat/diagnostic*.js`), and the visualization renderers (`render/visualization.js`, `render/visualizationAdapters.js`, `render/viz.js`, `render/widgetParsers.ts`).
- **Stop_Action**: The user-initiated control that halts an in-progress assistant turn.
- **Resend_Action**: The user-initiated control that resubmits the most recent user message to start a new turn.
- **Terminal_Phase**: A tool run phase from which no further transition occurs: succeeded, failed, cancelled, or timed_out.

## Requirements

### Requirement 1: Tool-call reliability

**User Story:** As a user relying on tool-assisted answers, I want tool calls to retry transient failures, honor stop requests, and report a consistent final state, so that I can trust the results the assistant presents.

#### Acceptance Criteria

1. WHEN a provider-backed model call fails with a transient transport or upstream failure and no semantic output has been emitted, THE Retry_Policy SHALL classify the failure as retryable.
2. IF a provider-backed model call fails with an authentication, quota, content-policy, or invalid-request condition, THEN THE Retry_Policy SHALL classify the failure as non-retryable.
3. WHEN the user triggers the Stop_Action during an in-progress turn, THE Retry_Policy SHALL classify the resulting abort as a user abort and SHALL NOT retry the turn.
4. WHEN a retryable failure occurs and the current attempt count is below the configured maximum attempts, THE Stream_Controller SHALL wait the configured retry delay and start a new attempt.
5. WHEN a tool run receives its first Terminal_Phase event, THE Tool_Run_State SHALL retain that terminal phase and SHALL ignore later phase-transition events for that run.
6. THE Tool_Run_State SHALL produce identical phase transitions and run summaries from its WASM path and its TypeScript path for the same input sequence.
7. WHEN an interrupted stream is a heartbeat interruption with no semantic activity and the attempt count is below the maximum attempts, THE Stream_Controller SHALL replay the request.

### Requirement 2: Input and streaming smoothness

**User Story:** As a user typing and reading long answers, I want the input to stay responsive and the streamed text to render smoothly with reliable auto-scroll and stop/resend controls, so that the conversation feels fluid like ChatGPT.

#### Acceptance Criteria

1. WHILE an assistant response is streaming, THE Stream_Renderer SHALL coalesce incoming deltas and repaint at a perceptual cadence that scales with accumulated response length rather than once per network chunk.
2. WHILE an assistant response is streaming, THE Input_Composer SHALL accept keyboard input and update the composer text within 100 milliseconds of each keystroke.
3. WHILE an assistant response is streaming and the message list is scrolled to the bottom, THE Chat_UI SHALL keep the newest content in view using smooth scrolling.
4. WHEN the user scrolls away from the bottom during streaming, THE Chat_UI SHALL stop auto-scrolling until the user returns to the bottom.
5. WHILE an assistant turn is in progress, THE Chat_UI SHALL present the Stop_Action.
6. WHEN the user triggers the Stop_Action, THE Stream_Controller SHALL halt the in-progress turn and THE Chat_UI SHALL present the Resend_Action for the most recent user message.
7. WHEN the user triggers the Resend_Action, THE Stream_Controller SHALL start a new turn from the most recent user message.
8. WHILE the Stream_Renderer holds an incomplete markdown construct, THE Stream_Renderer SHALL keep that construct in the live tail until the construct is complete before promoting it to settled output.

### Requirement 3: Tool-card and overall visual design

**User Story:** As a user reviewing assistant work, I want tool cards, message bubbles, and code blocks that match ChatGPT's visual style, so that the conversation is clear and easy to scan.

#### Acceptance Criteria

1. THE Tool_Card SHALL render as a collapsible card that can be expanded and collapsed by the user.
2. WHILE a tool run is not in a Terminal_Phase, THE Tool_Card SHALL display a running indicator and the elapsed time of the run.
3. WHEN a tool run reaches a Terminal_Phase, THE Tool_Card SHALL display the terminal phase and the total duration of the run.
4. THE Tool_Output_Renderer SHALL escape every byte of tool output before insertion into the DOM so that markup contained in tool output does not execute.
5. WHEN tool output contains a fenced code block or a JSON document, THE Tool_Output_Renderer SHALL render it as a syntax-highlighted code block or pretty-printed JSON respectively.
6. WHERE a rendered message contains a code block, THE Chat_UI SHALL display a copy control that copies the code block content to the clipboard.
7. THE Chat_UI SHALL render user and assistant messages using the revamped message-bubble, spacing, and color styles defined in `styles.css`.

### Requirement 4: Teaching capability retention (compatibility)

**User Story:** As an educator and learner, I want all existing teaching capabilities preserved through the revamp, so that the visual and experience alignment does not remove or weaken any teaching feature.

#### Acceptance Criteria

1. THE Chat_UI SHALL retain the socraticDirectives, tutorSocratic, diagnostic, and visualization Teaching_Modules with their existing behavior.
2. WHERE a response contains a teaching scaffold or visualization payload, THE Chat_UI SHALL render it through the corresponding Teaching_Module.
3. WHEN the revamp changes the presentation of a Teaching_Module, THE Chat_UI SHALL change only visual styling and preserve the module's functional inputs and outputs.

### Requirement 5: Verification and quality gates (non-functional)

**User Story:** As a maintainer, I want the revamp to pass the established quality gates, so that the changes merge safely on the existing frontend gate.

#### Acceptance Criteria

1. THE chat-experience-revamp changes SHALL pass `npm run lint`, `npm run test:unit`, and `npm run build`.
2. THE chat-experience-revamp changes SHALL keep the WASM and TypeScript parity tests passing.
3. WHERE a change affects tool-card, streaming, or input behavior, THE chat-experience-revamp changes SHALL be covered by the relevant Playwright specification.
