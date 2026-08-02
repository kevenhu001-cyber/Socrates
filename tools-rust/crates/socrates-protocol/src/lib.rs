//! socrates-protocol — the Socrates tool-call wire protocol.
//!
//! Serde models for the SSE events the chat stream emits
//! (`server/src/routes/chat/stream.ts`), plus the client-side tool-run phase
//! state machine originally implemented in
//! `frontend/src/chat/toolRunState.ts`.
//!
//! Field names map 1:1 to the wire format (camelCase). Missing optional
//! fields deserialize to `None`/defaults so a partial frame never fails to
//! parse — matching the lenient `|| ''` / `|| 0` fallbacks in the server and
//! client code.

pub mod events;
pub mod phases;

pub use events::{Artifact, PlanSpec, SearchResult, SpecSpec, ToolCallDelta, ToolProgress, ToolResult, ToolUse, VisualizationSpec};
pub use phases::{summarize, transition, phase_from_progress, is_terminal, ToolRun, ToolRunSummary};
