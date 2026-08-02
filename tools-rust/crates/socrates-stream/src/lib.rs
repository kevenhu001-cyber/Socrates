//! socrates-stream — newline-gated streaming with adaptive commit pacing.
//!
//! Port of Codex's TUI streaming machinery (`codex-rs/tui/src/streaming/`):
//! - [`StreamController`]: two-region model (stable committed lines + a
//!   mutable pending tail). Only newline-terminated source becomes stable,
//!   so a partial line never flickers in and out of the committed region —
//!   the same reason Codex gates table rows on `\n`.
//! - [`AdaptiveChunkingPolicy`]: two-gear (Smooth/CatchUp) commit pacing with
//!   hysteresis, so a bursty stream catches up quickly while steady output
//!   stays animated line-by-line.
//!
//! Timestamps are `u64` milliseconds supplied by the caller (e.g.
//! `performance.now()`), keeping the crate dependency-free and WASM-friendly.

pub mod chunking;
pub mod controller;

pub use chunking::{AdaptiveChunkingPolicy, ChunkingDecision, ChunkingMode, DrainPlan, QueueSnapshot};
pub use controller::{CommitUpdate, StreamController};
