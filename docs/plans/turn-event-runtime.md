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
  The current model-facing tool still generates a nodes array: it emits add
  operations and a final commit, not model-authored patch commands.
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

Provider-specific public reasoning-summary delta adapters, user-editable UI
patch generation, claim/citation annotations, Deep Research plan review and
report workspace, and higher-level semantic components remain separate work.
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
