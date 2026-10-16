# Public turn event runtime — first implementation (2026-10-16)

The first increment moves public activity and native Intelligent UI onto one
versioned, ordered `turn_event` SSE stream. Existing prose deltas, tool events
and historical UI fences remain compatible. The SPA consumes an immutable
`TurnRuntime` snapshot; the reducer and security validator live in DOM-free
`packages/core`, and the wire types live in `packages/contracts`.

## Implemented behavior

- Complete node objects are extracted incrementally from cumulative native
  `render_intelligent_ui` arguments. Strings, escapes and nested JSON are
  tracked across chunks. No incomplete JSON repair is used for previews.
- Parents are emitted before children; forward references wait. Every emitted
  prefix passes the same size, complexity, ID, graph and URL validation as
  final tool execution. Rewrites, unsafe nodes and rejected execution retract
  the preview. Successful execution commits the authoritative document.
- Surface identity is the tool call ID. The SPA can display a surface before
  `tool_use`; the eventual tool record reuses that host and node keys. Local
  slider/choice/button state survives additions and commit.
- Activities have stable IDs and independent phases. Parallel tool results
  settle their own entries. Prose generation does not clear real process work.
  The disclosure contains observations and explicitly public summaries only;
  private reasoning text never populates timeline entries.
- The shared reducer supports validated add/patch/commit/abort operations.
  The render tool streams a nodes array and commits it; `patch_intelligent_ui`
  adds model-authored atomic edits of committed current-turn surfaces below.
- Stop/failure closes running activities and discards unfinished UI. Committed
  artifacts survive. Sequence checks ignore duplicate/older replay and events
  from a different turn. Detached recovery forwards the same events, including
  snapshots that completed before reconnection.
- Session save, beacon and history restore preserve the bounded snapshot.
  The backend persists it with the final assistant message for detached runs.
  Detached turns also checkpoint a snapshot, so recovery does not depend on
  fitting the entire event history into the initial 200-event response.

## Persistence and rollout

Apply migration `0043_messages_turn_runtime` with `cd server && npm run db:migrate`
**before** starting this backend version. It adds a nullable JSONB snapshot column to
`messages` and `chat_turns`; existing rows require no backfill. This change has not applied the
migration to a running database or deployed any services.

Rollback the application first and leave the unused nullable columns in place.
Older clients ignore `turn_event` and continue using existing tool/prose frames.
Session saves that omit runtime data preserve an existing stored snapshot.
After all new binaries are stopped, the columns can optionally be dropped; doing
so loses the new activity history and previews, while prose/toolCalls remain.

Snapshots are capped at 160,000 JSON characters, 256 activity entries and 20
surfaces. A UI document retains its existing 80-node/60,000-character limits.
The event log receives node/activity boundaries, not private reasoning tokens
or a second copy of every prose token. Ordinary text playback and its renderer
cache remain in the existing path.

## Remaining increments

The first implementation is consumed by the baseline SPA. Universal App
components can adopt the shared reducer without introducing DOM dependencies;
its existing tool event fallback remains compatible. Prose/tool normalization
into a broader runtime can be migrated incrementally.

Provider-specific public reasoning-summary delta adapters, cross-turn/user-driven
UI editing, Deep Research plan review and report workspace, and higher-level
semantic components remain separate work. The 2026-10-17 increment below adds
current-turn model patch generation and structured claim/citation annotations.
No private reasoning extraction is used as a substitute for public summaries.

## Validation notes

Focused coverage includes the incremental parser at every character boundary,
unsafe/rewritten input retraction, the real provider-to-SSE pipeline (the first
node must arrive before the provider is allowed to finish its arguments),
ordered replay, checkpoint recovery, immutable React snapshots, and browser
checks for local-state retention across parallel tool arrival and commit.
Screenshots are written only under the ignored `frontend/test-results/`.

The wider chat regression run exposed an existing failure in
`e2e/chat-send.spec.mjs:41` (mobile send): the test expects the entering user row
transform to be `none`, but an existing animation produces a scale/translation
matrix. The same assertion failed on an independently built clean HEAD
`68cdeb50`. This runtime change does not modify that animation.

The SQL migration is additive and was reviewed with its Drizzle snapshot and
journal. Database-backed migration/session round-trip verification was not run;
the migration has not been applied to a running database.

## Thinking/Activity v2, Citation v2 and UI patch tools (2026-10-17)

The baseline SPA now separates four presentation concepts without changing
legacy storage fields: `_taskSummary` is an intent preview, `_liveStatus` and
runtime activity are observed progress, only explicit `reasoning_summary` /
`public_reasoning_summary` supplies thought-summary content, and `summary` is
a completed activity/outcome observation. Intent/outcome never supply thought
copy. Private think ranges produce no disclosure. A thought disclosure contains
at most five unique public entries; it does not duplicate tool rows or phase
labels. Generic waiting/thinking text remains chrome. Completed durations count
the union of observed reasoning intervals, excluding tool/wait/synthesis time.
Provider-specific summary adapters are still separate work; this increment
never invents summary text for providers without that explicit signal.

`web_search` and `web_fetch` register bounded, credential-free HTTP(S) sources
with stable per-turn IDs and return those IDs to the model. `cite_sources`
accepts exact quotes from already-written visible prose and registered source
IDs. The server resolves quotes to UTF-16 raw-text ranges and atomically emits
`claim.annotate` events linking claim IDs → citation IDs → source IDs.
Ambiguous quotes require an explicit zero-based occurrence (at most 1000).
Unknown sources, private/code/math/link ranges and overlapping annotations
fail without publishing a partial batch. This validates provenance and position;
it does not assert that the source entails or independently verifies a claim.

The client inserts its own reference links only after matching the quote/range
against displayed prose. Numerical text written by a model is not interpreted
as evidence. Inline references support hover/focus preview, click/Enter, Escape
and touch; a Sources disclosure aggregates cited URLs. No external favicon or
preview request is made. Existing numerical-marker cleanup protects legacy
unstructured answers; generated structured Markdown links survive it.

`patch_intelligent_ui` accepts a surface ID (the original render tool call ID),
revision and 1–40 operations: add node, patch props, remove subtree. It targets
committed surfaces in the current live turn. Revision 0 is the initial document;
each accepted batch advances it once via `ui.edit`. A stale revision or invalid
final document rejects the entire batch. Patches cannot change identity, type
or parent; removed subtrees must leave a valid nonempty document. Render/patch
tools share a scheduling lane. The existing React host, node keys and merge-only
local defaults retain the user's control state and focus on surviving nodes.
This is model-driven current-turn editing, not a cross-turn artifact editor or
an asynchronous UI action loop. Those require an explicit artifact ownership
and interaction protocol in a later increment.

Storage sanitization rebases claim ranges and native surface offsets when
control characters or surrounding whitespace are removed. Live/checkpoint
snapshots retain their original text coordinate system. A stale quote never
falls back to guessed matching against a different answer.

Evidence and surface revisions are optional additive fields in version 1
snapshots. Existing snapshot size bounds, checkpoint/replay, beacon/session
save and stop/failure behavior apply. There is no new database migration;
installation still requires the existing 0043 migration described above.
Rolling back the application leaves the JSON data in place; older clients
ignore the new events and retain prose/tool-result fallbacks. The Universal
App can consume these DOM-free types/reducers; its native components have not
yet adopted the SPA's new evidence/patch presentation. The retired `mobile/`
source tree is not a compatibility target.

Validation for this increment includes frontend lint/build, server typecheck,
the native provider→tool→SSE pipeline, evidence/patch/semantic unit tests,
source previews in both themes on desktop/mobile, history restore and local
control/focus retention. The broader chat regression run passed 39 of 40 browser
cases. Its sole failure remains `e2e/chat-send.spec.mjs:85`: the mobile send test
expects no user-row transform during an existing entry animation. An independent
build of clean HEAD `ebae38ce` reproduced that same assertion failure.

The broader unit subset also exposed the existing
`test/toolRunRow.test.mjs:66` shimmer-class expectation. Clean HEAD `ebae38ce`
reproduced it too; the production tool row and that assertion are unchanged.
Database-backed session round trips were not run. The storage-range regression
is covered by the pure sanitizer-coordinate helper tests; no migration or
deployment was performed.
