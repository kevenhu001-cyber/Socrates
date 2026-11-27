# Effort-scaled tool loop and intent prewarm — 2026-11-27

Scope: the server-owned chat tool loop (`routes/chat/pipeline/toolLoop.ts`,
`services/tools/toolTurnPolicy.ts`) and the deferred-tool intent classifier
(`routes/chat/pipeline/toolContext.ts`). No provider capability or tool schema
was changed.

## Problem

A simple question could still spend a whole turn in tool discovery, failed
retries and repeated synthesis even after the user chose Low reasoning. Two
mechanisms allowed that:

- the tool policy used the same 12-round / 24-call / 15-minute budget at every
  reasoning level, so Low only affected the provider's thinking, not the
  loop's willingness to keep going;
- the deferred-tool prewarm treated any mention of "解释", "推导", "项目" or
  "图表" as a request for a visual or workspace agent, and Tutor mode loaded
  the visualization stack on every turn. The model then had expensive tools
  in front of it for prose explanations.

## Changes

### 1. Reasoning effort scales the tool budget

`createToolTurnPolicy({ reasoningEffort })` now derives its defaults from the
requested level:

| Effort | Tool rounds | Calls per round | Total calls | Wall clock |
| --- | ---: | ---: | ---: | ---: |
| Instant (`none`) | 2 | 4 | 4 | 2 min |
| Low | 4 | 6 | 8 | 5 min |
| Medium | 8 | 8 | 16 | 10 min |
| High / unspecified | 12 | 8 | 24 | 15 min |

The loop still makes a final tools-disabled hop, so a 4-round budget means up
to four tool rounds plus one prose answer. `CHAT_MAX_TOOL_ITERATIONS`,
`CHAT_MAX_TOOL_CALLS_PER_TURN`, `CHAT_MAX_TOOL_CALLS_TOTAL` and
`CHAT_TOOL_WALL_CLOCK_MS` remain explicit operator overrides and win over the
effort default. The requested effort is threaded through the route shell so
the policy is built alongside the existing DB prelude, not after it.

For a model whose provider ignores effort (for example MiniMax M3, where
`effort: 'ignored'` in the capability registry), this does not pretend the
model thinks less. It does stop the *loop* from spending the full budget and
is consistent with the capability summary that controls whether Low is
offered.

### 2. Prewarm requires an action, not a topic

The deferred set is an optimization, not an authorization gate: an
un-prewarmed tool still stays discoverable through `search_connectors`. The
classifier now requires an explicit creation or workspace verb for the
expensive tools:

- visualization: a visual verb (画/绘制/生成/制作/展示/render/draw/plot/…) plus
  a visual noun (图/图表/示意图/演示/仿真/chart/diagram/…);
- workspace: a mutation or inspection verb plus a file/repo/project/test
  object, and not a definitional question ("什么是…", "为什么…");
- document, site, arXiv and image search: their own verb + object pair.

Tutor mode no longer prewarms visualization unconditionally. "解释这个图表",
"推导这个方程", "这个项目为什么慢", "什么是 HTML", "论文怎么写" and
"图片格式有哪些" all leave the expensive tools deferred.

### 3. Prompt-level stop rules

The native tool contract now tells the model to answer directly for general
knowledge, definitions, short calculations and explanations, not to call a
tool just to confirm known information, and to stop after the result that
settles the question. The web-search hint asks for one concise query and no
confirming second search; the web-fetch hint skips a page when the snippet
already answers. The workspace-agent hint now scopes the agent to actual
file/project work and explicitly excludes explaining code or writing a short
chat snippet.

### 4. System-prompt efficiency defaults

The server policy now starts with an explicit effort rule: use the least work
that reliably completes the request, answer from knowledge or supplied
context when possible, prefer one sufficient tool call over a chain, and stop
once the requested result is available. It states that reasoning effort is a
ceiling rather than a target and forbids narrating a plan before acting.
Tool discovery is limited to tools that are not already supplied, and a
visual or learning card is used only when it helps understanding, not because
a tool exists.

The final-output block now tells the model not to open with a plan,
acknowledgement or question restatement, and scales teaching depth to the
request: a definition, fact or short calculation gets a direct answer, while
only requests that need understanding get the textbook-style explanation and
example. The high-effort rule checks only assumptions that could change the
answer and stops once the result is stable. The compact Beagle identity now
defaults to a direct answer instead of encouraging tools for calculations,
verification and visuals.

## Verification

- `server/test/toolTurnPolicy.test.js` — effort budgets and env overrides.
- `server/test/promptEfficiency.test.js` — effort reaches the policy; simple
  explanations keep visual/workspace/document/site/paper/image tools deferred;
  explicit artifact requests prewarm them.
- `server/test/chat-helpers.test.js` — direct-answer rule, workspace scope,
  one-search/one-fetch guidance, effort ceiling and final-answer stop rule.
- `server/test/prompts.test.js` — the Beagle identity defaults to a direct
  answer and one sufficient tool call.
- `server/test/promptComposition.test.mjs` — depth follows the request and a
  visual is never added just because the tool exists.
- `cd server && npm run typecheck`, `npm run lint:boundaries`.

The budgets are heuristics. High remains the previous default so complex
turns do not regress; the next measurement should compare tool-round counts
and first-content latency for Low between the two revisions.
