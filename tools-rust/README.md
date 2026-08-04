# `tools-rust/` — Socrates Rust mechanism library

A Rust workspace that ports the language-agnostic parts of Codex CLI's tool-calling and
tool-display conventions into Socrates. The crates compile to native Rust (cargo test)
**and** to WebAssembly (consumed by `frontend/`). DOM rendering stays in JS — only the
algorithms move to Rust.

The on-disk `codex/` source is **read-only reference material**; nothing in this
workspace imports from it. Wire formats, SSE protocol, and persistence layout are
unchanged. `server/` and `frontend/src/main.js`'s top-level stream wiring are
out of scope (see [v2 roadmap](#v2-roadmap)).

## Why Rust + WASM

The target mechanisms (phase state machines, line-aware truncation, bounded streaming
buffers, adaptive commit pacing, category grouping) are pure algorithms with sharp
edge cases. They are easier to specify, test, and reuse as a typed Rust API than as a
duplicated TypeScript port. WASM gives the same code path on the browser side
without a Node round-trip. TypeScript fallbacks remain so the app still works
without a built `frontend/wasm/` artifact.

## Layout

```
tools-rust/
├── Cargo.toml                  # workspace (resolver = "2")
├── rust-toolchain.toml         # stable + wasm32-unknown-unknown
└── crates/
    ├── socrates-protocol/      # SSE event serde models + tool-run phase state machine
    ├── socrates-format/        # truncate_lines / LiveBuffer / group_tool_calls / categorize
    ├── socrates-stream/        # StreamController + AdaptiveChunkingPolicy
    └── socrates-wasm/          # wasm-bindgen bindings (cdylib) over the three above
```

Each crate owns its own `Cargo.toml` and its `tests/` module under `src/`.
The workspace `Cargo.lock` is committed.

## Mechanism mapping

The "Codex source" column points at the reference file in the vendored
`codex/` tree that the port was derived from. The "Frontend consumer"
column names the TypeScript file that calls the WASM binding (or its
fallback) in `frontend/src/`.

| Socrates mechanism | Codex source (reference) | Rust module | WASM binding | Frontend consumer |
|---|---|---|---|---|
| Phase strings (raw `tool_progress.phase`) → display phase (`queued`/`preparing`/`running`/`succeeded`/`failed`/`cancelled`/`timed_out`) | (Codex CLI does this in `tui`; Socrates did it inline in `toolRunState.ts`) | `socrates_protocol::phases::phase_from_progress` | `phase_from_progress_js` | `frontend/src/chat/toolRunState.ts` |
| First-terminal-wins transition (succeeded/failed/cancelled/timed_out lock; unknown phases pass through) | n/a — Socrates-only convention (was in `toolRunState.ts`) | `socrates_protocol::phases::transition` | `transition_run` | `frontend/src/chat/toolRunState.ts` |
| `is_terminal(phase)` | n/a | `socrates_protocol::phases::is_terminal` | `is_terminal_phase` | `frontend/src/chat/toolRunState.ts` |
| `summarize(&[ToolRun]) -> {total, active, succeeded, failed, cancelled, timed_out}` | n/a | `socrates_protocol::phases::summarize` | `summarize_runs` | `frontend/src/chat/toolRunState.ts` |
| SSE event serde models (`ToolCallDelta`, `ToolUse`, `ToolProgress`, `ToolResult`) — single source of truth, normalization helper | `codex-rs/tui/src/exec_cell/model.rs` | `socrates_protocol::events` (+ `ToolResult`) | `parse_tool_result` | (server emits these; used as the contract doc) |
| Line-aware head/tail truncation (`… +N lines` ellipsis) | `codex-rs/tui/src/exec_cell/render.rs` (TOOL_CALL_MAX_LINES=5) | `socrates_format::truncate::truncate_lines` | `truncate_tool_output` | `frontend/src/ui/toolInline.ts` (`detailText`) |
| Bounded incremental output buffer (head ring + tail ring + `omittedBytes`); caps 50 lines / 1 MiB | `codex-rs/tui/src/exec_cell/live_output.rs` | `socrates_format::live_buffer::LiveBuffer` | `LiveOutputBuffer` class | `frontend/src/chat/toolRuntime.ts` (LiveBuffer-backed bounded output for the card path) |
| Consecutive same-category tool grouping ("Searching the web (2)…") | `codex-rs/tui/src/exec_cell/render.rs` (Exploring / Explored) | `socrates_format::grouping::{group_tool_calls, categorize_tool}` | `group_tool_entries`, `categorize_tool_js` | `frontend/src/ui/toolInline.ts` (`toolCategory`, `updateInlineToolGroupLabel`) + `frontend/src/chat/toolRuntime.ts` (`sameToolCategory`, `mountLiveSingleCardRow`) |
| Newline-gated two-region streaming (`push_delta`, `finalize`, `drain_n`, `step`, `pending`, `oldest_queued_age_ms`) | `codex-rs/tui/src/streaming/controller.rs` | `socrates_stream::controller::StreamController` | `StreamController` class | **v2** — not yet wired into `frontend/src/main.js` (see [v2 roadmap](#v2-roadmap)). Currently only exercised by `frontend/test/wasmParity.test.mjs`. |
| Adaptive chunking policy (Smooth / CatchUp hysteresis; drain plan = `single` or `{batch: n}`) | `codex-rs/tui/src/streaming/chunking.rs` | `socrates_stream::chunking::AdaptiveChunkingPolicy` | `ChunkingPolicy` class | **v2** — same as above |

> **DOM stays in JS.** The Codex TUI cell layouts, ANSI rendering, and history-store
> persistence are deliberately not ported. Only the algorithms are.

## Build & run

### Toolchain (one-time)

```bash
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.126
```

The `rust-toolchain.toml` pins `stable` + `wasm32-unknown-unknown`; any
devtoolchain run from inside `tools-rust/` will resolve itself.

### Native tests

```bash
cd tools-rust
cargo test --workspace
```

Counts today: 6 (fetch) + 26 (format) + 19 (protocol) + 20 (stream) = **71 passing**, plus
binding-shape tests run in Node via `frontend/test/wasmParity.test.mjs`.

### Native fetch worker (server canary)

`socrates-fetch` adds a long-lived `socrates-fetchd` JSONL worker for the
server-side `web_fetch` path. It owns DNS resolution, private/reserved IP
rejection, pinned connections, manual redirect validation, response content
type checks, bounded streaming reads, request deadlines, and an optional
bounded text-density extraction pass. Node keeps authentication, rate
limiting, URL-cache ownership, Readability fallback, and the existing
`fetchBatch` response shape.

```bash
cd tools-rust
cargo build --release -p socrates-fetch
```

Enable it explicitly for a canary process:

```bash
SOCRATES_RUST_FETCH=1
SOCRATES_FETCHD_PATH=/absolute/path/to/socrates-fetchd
# Optional, only after corpus comparison:
SOCRATES_RUST_EXTRACT=1
```

If the flag is absent or the binary is unavailable, `server/src/services/fetchBatch.ts`
uses the existing Node implementation. This makes rollout and rollback a
configuration change rather than an API or persistence change.
`SOCRATES_RUST_EXTRACT=1` is a separate canary: pages that do not yield a
credible native article continue through the existing Readability fallback.

### WASM artifact (consumed by `frontend/`)

```bash
cd frontend
npm run build:wasm
```

This:

1. Runs `cargo build --release --target wasm32-unknown-unknown -p socrates-wasm`
2. Runs `wasm-bindgen --target web --out-dir frontend/wasm ...`
3. Writes `frontend/wasm/socrates_wasm.js` + `frontend/wasm/socrates_wasm_bg.wasm`
   (+ `.d.ts` siblings).

`frontend/wasm/` is gitignored. Vite picks the artifacts up natively via
`new URL('../../wasm/socrates_wasm.js', import.meta.url)` in
`frontend/src/lib/socratesWasm.js`.

The Node-side parity test (`frontend/test/wasmParity.test.mjs`) reads the
artifact and instantiates it with `init(bytes)` (a `Uint8Array`) to side-step
the `file://` fetch restriction that affects `--target web` artifacts in
Node. The browser path uses `init()` (no args) and lets the runtime fetch the
`.wasm` via `import.meta.url`.

### Version pinning

`wasm-bindgen` versions must match between the `wasm-bindgen` crate
dependency and the `wasm-bindgen-cli` binary; otherwise the generated
bindings are ABI-incompatible with the artifact. `build-wasm.mjs` resolves
the CLI from `PATH` first, then `~/.cargo/bin/`, then honors `WASM_BINDGEN=…`
for explicit overrides.

## Frontend integration points (v1)

All four points preserve the existing public API of the TypeScript file;
each consumer has a JS fallback so the app keeps working without the
WASM build.

| # | File | What changed | Fallback |
|---|---|---|---|
| 1 | `frontend/src/chat/toolRunState.ts` | `phaseFromProgress`, `transitionToolRun`, `summarizeToolRuns`, `isTerminalPhase` delegate to WASM via `getSocratesWasm()`. Public signatures unchanged. | In-file TS reference implementation. |
| 2 | `frontend/src/ui/toolInline.ts` | `truncateDetailLines` (used by `detailText`) replaced the fixed 12 KB slice with WASM `truncate_tool_output` (head 5 + tail 5 + `… +N lines`). | Original 12 KB slice retained. |
| 3 | `frontend/src/chat/toolRuntime.ts` | Tool-progress chunks pass through a WASM `LiveOutputBuffer` (50 lines / 1 MiB caps) before render; settle serializes a head/tail bounded preview. | `frontend/src/chat/liveOutput.ts` TS port. |
| 4 | Live chat rows | Consecutive same-category live compact rows collapse into a single labelled row ("Searching the web (2)…"); all rows still serialize independently on settle (persistence format unchanged). | Pre-grouping behavior retained. |

Each integration is covered by `frontend/test/wasmParity.test.mjs` (asserts
the WASM output equals the TS fallback for the same inputs) and by the
existing `frontend/test/toolRuntime.test.mjs` (13 tests) and
`frontend/test/toolInline.test.mjs`.

### `package.json` scripts added

```jsonc
"build:wasm": "node scripts/build-wasm.mjs"
```

The regular `npm run lint`, `npm run typecheck`, `npm run test:unit`, and
`npm run build` scripts remain the source of truth for frontend gating.

## What v1 explicitly does **not** do

- `frontend/src/main.js` message-flow rewire onto `StreamController` /
  `ChunkingPolicy`. The top-level stream path is tightly coupled with the
  `textOffset` inline-insert mechanism across a 9546-line entry file;
  v1 only delivers the WASM API plus its tests. See [v2 roadmap](#v2-roadmap).
- General server-side Rust-ification remains deferred; `server/` keeps its
  existing TypeScript stack outside the fetch and extraction canaries.
- The native `socrates-fetchd` worker is now available behind the explicit
  `SOCRATES_RUST_FETCH=1` canary flag, and its bounded HTML text-density
  extractor can be enabled separately with `SOCRATES_RUST_EXTRACT=1`.
- Search engine orchestration remains in TypeScript until profiling and corpus
  parity justify the next migration.
- CI changes — `.github/workflows/ci.yml` is untouched. Adding a Rust job is
  listed under [v2 roadmap](#v2-roadmap).
- Any change to the SSE wire contract. `socrates_protocol::events` is the
  typed mirror used to validate/normalise `tool_result` frames; the bytes
  on the wire are unchanged.
- Any change to persistence format. Every tool call still records its
  independent `textOffset`; live-row grouping is **presentation-only**.

## v2 roadmap

| Item | Why deferred | What needs to happen first |
|---|---|---|
| Wire `StreamController` into `frontend/src/main.js`'s assistant-message render path | `textOffset` insertion is interleaved with the per-chunk DOM mutation in a high-churn entry file; v1 should prove the API stable first. | Land `ChunkingPolicy` drain-plan binding helpers (`single` vs `{batch: n}`) and add a focused unit test for `finalize` semantics across tool_progress + tool_result interleavings. |
| Add `.github/workflows/ci.yml` Rust job (`cargo fmt`, `cargo clippy`, `cargo test --workspace`, `wasm32-unknown-unknown` build) | Repo policy keeps the merge gate green-and-minimal; CI grows when v2 surface lands. | A `tools-rust/clippy.toml` baseline so the job starts clean. |
| Optional: server-side Rust dispatch (re-implement `server/src/routes/chat/stream.ts` on the protocol model) | The `parse_tool_result` WASM helper already validates one frame; lifting dispatch requires a strategy for sharing `serde` models across the node→wasm boundary (N-API vs. shared `.dll`/`.so`). | Decide on the host-side FFI strategy (likely napi-rs). |
| Move the TS fallbacks out | Once v2 lands and WASM is bundled into the production build path, the fallback branches in `toolRunState.ts` / `toolInline.ts` / `toolRuntime.ts` / `liveOutput.ts` can be removed. | Audit `frontend/wasm/` presence in production CI artifact and the Vite `optimizeDeps` config. |
| Group `tool_progress.phase` strings with non-Codex values (e.g. server-side custom phases) | `phase_from_progress` passes unknown strings through as `running`; if the server grows a new terminal value, the frontend won't know to lock. | Add a server-emitted phase registry in `server/src/routes/chat/stream.ts` and a contract test that asserts every emitted terminal phase is mapped. |
