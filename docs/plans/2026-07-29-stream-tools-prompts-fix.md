# Stream Completion, Inline Tools, and Prompt Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use the Code workflow to implement this plan task-by-task.

**Goal:** Stop completion-time viewport jumps, make inline tool events safe and idempotent, and reduce contradictory system-prompt instructions.

**Architecture:** Preserve the reader's visual anchor across the existing legacy-to-React message handoff instead of deriving position from changing document heights. Harden the browser runtime against duplicate and out-of-order SSE events, and harden the server boundary before execution and before tool output is returned to the model. Compose both chat prompts from short shared policies.

**Tech Stack:** Vite, React, TypeScript, Express, Node test runner, Playwright, Bash deployment script.

---

### Task 1: Completion-time viewport stability

**Files:**
- Modify: `frontend/src/main.js`
- Test: `frontend/e2e/streaming-render.spec.mjs`

1. Capture the visible message identity and its offset immediately before publishing the finalized React snapshot.
2. After the React node exists and the legacy node is removed, restore that message to the same viewport offset.
3. Keep bottom-pinned readers at the bottom, but never move readers who intentionally scrolled away based on list height.
4. Run the focused streaming Playwright spec.

### Task 2: Inline tool runtime idempotency

**Files:**
- Modify: `frontend/src/chat/toolRuntime.ts`
- Test: `frontend/test/toolRuntime.test.mjs`

1. Add failing tests for duplicate `tool_use`, duplicate execution-start events, and progress arriving before `tool_use`.
2. Reuse existing tool entries by call ID and drain orphan progress when the matching use event arrives.
3. Deduplicate execution EventSource connections by execution ID and tool-call ID.
4. Run frontend unit tests and type checking.

### Task 3: Server tool boundary hardening

**Files:**
- Create: `server/src/services/toolCallSafety.ts`
- Modify: `server/src/routes/chat/stream.ts`
- Test: `server/test/toolCallSafety.test.js`

1. Add tests for strict JSON-object arguments, bounded/unique normalized tool calls, and prompt-injection-safe output envelopes.
2. Normalize and cap each model tool-call batch before echoing it into protocol history.
3. Reject malformed arguments and disabled or unknown tools without executing them.
4. Wrap every tool result returned to the model as untrusted data.
5. Reserve a final tools-disabled completion after the maximum execution rounds.
6. Run server type checking and tests.

### Task 4: Prompt cleanup

**Files:**
- Modify: `frontend/src/chat/systemPrompts.js`
- Test: `frontend/test/systemPrompts.test.mjs`

1. Add assertions for the untrusted-tool-output rule, absence of chain-of-thought disclosure demands, and a prompt-size ceiling.
2. Replace duplicated high/concise policies with shared language, reliability, math, and tool rules.
3. Reduce the Python appendix to execution constraints that are not already carried by the tool schema.
4. Run frontend unit tests and build.

### Task 5: Full verification and deployment dry run

1. Run `npm run lint`, `npm run test:unit`, and `npm run build` in `frontend/`.
2. Run focused Playwright streaming and compatibility specs.
3. Run `npm run typecheck` and `npm test` in `server/`.
4. Validate `deploy.sh` syntax, inspect its dry-run support, and exercise lock, candidate cleanup, health-gate, and rollback paths only in a temporary non-production fixture.
5. Confirm no generated `dist/`, reports, secrets, or deployment state are included in the final changes.
