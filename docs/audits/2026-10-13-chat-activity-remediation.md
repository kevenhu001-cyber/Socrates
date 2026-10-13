# Chat activity audit remediation — 2026-10-13

The chat transcript now derives activity and action availability through
`frontend/src/ui/turnActivityModel.ts`. Provider scratch work remains private;
regex topic guesses and `_liveStep` extraction have been removed.

## Implemented

- The server publishes additive `turn_activity` observations at provider and
  tool boundaries. These contain phases and tool identities, never reasoning
  excerpts. A thinking indicator alone does not count as semantic model output
  or disable transport retry protection.
- A running tool row owns visible progress. Deferred rows retain one status;
  retry/error/stopped notices retain precedence. Synthesizing has a status
  before prose arrives and a cursor once prose starts.
- Toolbar buttons mount only once playback settles. A server `done` event
  cannot enable them while the playback buffer is draining.
- React and degraded tool renderers share labels, categories and state
  interpretation. Detail-free React rows use static divs.
- Toolbar geometry and interaction styles move to `components/chat.css`;
  mobile overrides stay in `polish/mobile-controls.css`. The broader CSS
  compatibility cascade still exists for other surfaces.
- High effort asks for verifiable derivations and evidence, with explicit
  protection of private scratch work. Beagle's persona is provider-neutral
  and obtains exact tool names from supplied schemas.
- `render_intelligent_ui` accepts a versioned node document via native tool
  calls. The server checks size, safe node identities, parent graph, nested
  complexity, forbidden keys and URLs. Its output renders outside tool
  disclosure and obeys read-only presentation. Legacy prose fences remain
  readable for existing sessions; new prompts direct models to native tools.
- Tool persistence records actual executor status, so failed validation cannot
  become a successful UI card on reload or an inaccurate completed summary.

## Compatibility and rollout

No database migration is required. Progress is transient; detached-turn event
replay carries it through the existing generic SSE event ledger. Native UI
uses existing stored toolCalls and tool_use/tool_result frames. Older clients
can ignore progress events and show a generic tool result. Shared client SSE
handlers expose optional progress callbacks. Frozen legacy mobile sources are
absent from this checkout, so device rendering has not been validated.

Deploy frontend and backend together for native UI presentation. Rolling back
removes the new tool from the registry; old prose/fence messages remain
readable, and stored native tool calls degrade to ordinary tool rows on an old
frontend. No services were deployed by this change.

`public_reasoning_summary` is reserved for explicit provider public-summary
adapters. There is no raw-reasoning-to-summary fallback or additional summary
provider request in the live pipeline.

## Focused verification

Front-end lint and architecture guards, production build, activity/transport,
reasoning extraction, tool model/state/output, prompt and snapshot unit tests;
Playwright chat send/stop/resend, streaming, message compatibility, activity,
native and legacy Intelligent UI, and transcript/palette coverage. Server type
and production build checks plus prompt, activity, native UI, registry,
argument-safety and chat-helper tests. Screenshots stay under test-results.

Results: 166 focused frontend unit tests, 122 focused server tests, and 43
unique Playwright cases passed. Frontend lint, both production builds and
OpenAPI drift checks passed. The toolbar height regression caught during
verification was corrected by explicitly owning the desktop button minimum
size in the toolbar component CSS.
