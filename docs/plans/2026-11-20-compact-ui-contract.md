# Compact Intelligent UI Contract

## Contract, validation and compatibility

The model-facing `render_intelligent_ui` parameters require only `nodes`.
The shared normalizer supplies `version: 1`, deterministic IDs for **absent**
node IDs, and existing optional visualization defaults. Explicitly supplied
invalid IDs remain invalid. The full version-1 document and all 28 template
validators remain unchanged. `get_ui_contract` retrieves advanced guidance
from the same runtime metadata; it does not define a second executable format.

Architecture reference: `docs/plans/2026-11-09-unified-component-architecture.md`.

## Streaming and patch invariant

A partially streamed document cannot know about explicit IDs that appear
later, and must not publish a provisional generated ID that might later
collide. Nodes with explicit IDs continue emitting progressive `ui.add`
events. Once a compact stream contains an ID-omitting node, further previews
are deferred until a complete, validated `ui.commit` event. On commit,
**normalized** nodes are published and stored, so the node IDs are stable
for `patch_intelligent_ui`. The complete document reserves every explicit
ID before assigning generated IDs.

## Deployment and rollback

There are **no database migrations or new environment variables**.
Deploy the server and shared core package together and rebuild the frontend
against that core revision. Existing saved version-1 documents stay valid.
To roll back, revert the feature's compact schema, normalizer, routing hints,
and new contract tool together. Never revert only the normalizer while the
provider-facing schema still permits missing IDs. Smoke-test a compact
chart, a streamed compact chart, a versioned legacy chart and a patch after
rollout; verify rollback using the same fixtures.

## Testing and measurement

Agent/tool CI now runs schema consistency, all visualization-template
examples, contract pagination/round-trip, advanced demonstrations and turn
event streaming/patch tests. First-attempt model reliability, browser
render-success rates, and real token savings are not established by fixed
fixtures alone; measure them separately with real providers.
