//! socrates-wasm — wasm-bindgen bindings over the socrates mechanism crates.
//!
//! Exposes the tool-run phase machine, protocol models, truncation/grouping
//! algorithms, the live output buffer, and the streaming controller to the
//! browser frontend. Plain objects cross the boundary via
//! `serde-wasm-bindgen`; classes (`LiveOutputBuffer`, `StreamController`,
//! `ChunkingPolicy`) hold state across calls.
//!
//! The generated artifacts (`frontend/wasm/`) are consumed through
//! `frontend/src/lib/socratesWasm.js`; see `frontend/scripts/build-wasm.mjs`.

use wasm_bindgen::prelude::*;

use socrates_format::{LiveBuffer, ToolEntry, categorize_tool, group_tool_calls, truncate_lines};
use socrates_protocol::phases::{ToolRun, summarize, transition, is_terminal, phase_from_progress};
use socrates_protocol::ToolResult;
use socrates_stream::{AdaptiveChunkingPolicy, QueueSnapshot, StreamController as CoreStreamController};

// ---------------------------------------------------------------------------
// Phase state machine (frontend/src/chat/toolRunState.ts parity)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn phase_from_progress_js(progress_phase: Option<String>) -> String {
    phase_from_progress(progress_phase.as_deref())
}

#[wasm_bindgen]
pub fn is_terminal_phase(phase: &str) -> bool {
    is_terminal(phase)
}

/// First-terminal-wins transition; unknown phases pass through untouched.
#[wasm_bindgen]
pub fn transition_run(current_phase: &str, next_phase: &str) -> String {
    transition(current_phase, next_phase)
}

/// `runs` is a JS array of run objects or nulls (null entries are skipped,
/// matching the frontend). Returns a `ToolRunSummary` object.
#[wasm_bindgen]
pub fn summarize_runs(runs: JsValue) -> Result<JsValue, JsValue> {
    let runs: Vec<Option<ToolRun>> =
        serde_wasm_bindgen::from_value(runs).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let summary = summarize(&runs);
    serde_wasm_bindgen::to_value(&summary).map_err(|e| JsValue::from_str(&e.to_string()))
}

// ---------------------------------------------------------------------------
// Protocol model (wire contract single source of truth)
// ---------------------------------------------------------------------------

/// Validates/normalizes a `tool_result` frame object against the wire
/// contract and returns the normalized object (unknown keys are dropped).
#[wasm_bindgen]
pub fn parse_tool_result(obj: JsValue) -> Result<JsValue, JsValue> {
    let parsed: ToolResult =
        serde_wasm_bindgen::from_value(obj).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&parsed).map_err(|e| JsValue::from_str(&e.to_string()))
}

// ---------------------------------------------------------------------------
// Display algorithms (Codex exec_cell conventions)
// ---------------------------------------------------------------------------

/// Line-aware head/tail truncation. Returns `{ lines, omittedLines }`.
#[wasm_bindgen]
pub fn truncate_tool_output(text: &str, head: usize, tail: usize) -> Result<JsValue, JsValue> {
    let out = truncate_lines(text, head, tail);
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Collapses consecutive same-category tool entries into display groups.
/// Returns `[{ category, entries: [{ id, name }] }]`.
#[wasm_bindgen]
pub fn group_tool_entries(entries: JsValue) -> Result<JsValue, JsValue> {
    let entries: Vec<ToolEntry> =
        serde_wasm_bindgen::from_value(entries).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let groups = group_tool_calls(entries);
    serde_wasm_bindgen::to_value(&groups).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Classifies a tool name into a display category ('search', 'code', …).
/// Used by the frontend to decide whether consecutive live tool rows
/// belong to the same display group.
#[wasm_bindgen]
pub fn categorize_tool_js(name: &str) -> String {
    categorize_tool(name).as_str().to_owned()
}

// ---------------------------------------------------------------------------
// Bounded live output buffer (Codex LiveCommandOutput)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct LiveOutputBuffer {
    inner: LiveBuffer,
}

#[wasm_bindgen]
impl LiveOutputBuffer {
    #[wasm_bindgen(constructor)]
    pub fn new(max_lines: usize, max_bytes: usize) -> LiveOutputBuffer {
        LiveOutputBuffer {
            inner: LiveBuffer::new(max_lines, max_bytes),
        }
    }

    /// Appends a chunk (chunk boundaries may split lines).
    pub fn push(&mut self, chunk: &str) {
        self.inner.push(chunk);
    }

    /// Returns the bounded preview `{ head, tail, pending, omittedLines,
    /// omittedBytes, totalBytes, totalLines }`.
    pub fn preview(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.inner.preview())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Newline-gated streaming controller (Codex StreamCore)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct StreamController {
    inner: CoreStreamController,
}

#[wasm_bindgen]
impl StreamController {
    #[wasm_bindgen(constructor)]
    pub fn new() -> StreamController {
        StreamController {
            inner: CoreStreamController::new(),
        }
    }

    /// Appends a delta; returns `{ committedLines, pending, hasSeenDelta }`.
    /// `now_ms` stamps enqueued lines for age-based pacing decisions.
    pub fn push_delta(&mut self, delta: &str, now_ms: u64) -> Result<JsValue, JsValue> {
        let update = self.inner.push_delta(delta, now_ms);
        serde_wasm_bindgen::to_value(&update).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Commits the pending tail as a final line.
    pub fn finalize(&mut self, now_ms: u64) -> Result<JsValue, JsValue> {
        let update = self.inner.finalize(now_ms);
        serde_wasm_bindgen::to_value(&update).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Drains up to `max_lines` stable lines (JS array of strings).
    pub fn drain_n(&mut self, max_lines: usize) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.inner.drain_n(max_lines))
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Drains exactly one stable line.
    pub fn step(&mut self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.inner.step())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn queued_len(&self) -> usize {
        self.inner.queued_len()
    }

    /// Age (ms) of the oldest queued line, or `null` when the queue is empty.
    pub fn oldest_queued_age_ms(&self, now_ms: u64) -> Option<u64> {
        self.inner.oldest_queued_age_ms(now_ms)
    }

    /// The current mutable tail (partial line).
    pub fn pending(&self) -> String {
        self.inner.pending().to_owned()
    }

    pub fn is_idle(&self) -> bool {
        self.inner.is_idle()
    }

    pub fn emitted_stable_len(&self) -> usize {
        self.inner.emitted_stable_len()
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

// ---------------------------------------------------------------------------
// Adaptive chunking policy (Codex AdaptiveChunkingPolicy)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct ChunkingPolicy {
    inner: AdaptiveChunkingPolicy,
}

#[wasm_bindgen]
impl ChunkingPolicy {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ChunkingPolicy {
        ChunkingPolicy {
            inner: AdaptiveChunkingPolicy::default(),
        }
    }

    /// Returns `{ mode, enteredCatchUp, drainPlan }` where `drainPlan` is
    /// `"single"` or `{ batch: n }`.
    pub fn decide(
        &mut self,
        queued_lines: usize,
        oldest_age_ms: Option<u64>,
        now_ms: u64,
    ) -> Result<JsValue, JsValue> {
        let decision = self
            .inner
            .decide(QueueSnapshot { queued_lines, oldest_age_ms }, now_ms);
        serde_wasm_bindgen::to_value(&decision).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }
}
