//! socrates-format — display algorithms for tool output.
//!
//! Ports of the Codex CLI conventions (`codex/codex-rs/tui/src/exec_cell`):
//! - [`truncate_lines`]: line-aware head/tail truncation with an omitted-line
//!   count (the caller renders the "… +N lines" ellipsis row, keeping the
//!   library language-agnostic);
//! - [`LiveBuffer`]: bounded incremental output buffer (head ring + tail
//!   ring + omitted counters), mirroring `live_output.rs`;
//! - [`group_tool_calls`]: merges consecutive same-category tool calls into
//!   display groups, mirroring the "Exploring/Explored" grouping of
//!   `render.rs::exploring_display_lines`.

pub mod grouping;
pub mod live_buffer;
pub mod truncate;

pub use grouping::{ToolCategory, ToolEntry, ToolGroup, categorize_tool, group_tool_calls};
pub use live_buffer::{LiveBuffer, LivePreview};
pub use truncate::{TruncatedOutput, truncate_lines};
