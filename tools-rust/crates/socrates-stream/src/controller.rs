//! Two-region streaming controller.
//!
//! Port of Codex's `StreamCore`/`StreamState` bookkeeping
//! (`codex-rs/tui/src/streaming/controller.rs` and `streaming/mod.rs`),
//! reduced to plain text (the web frontend renders markdown itself):
//!
//! - raw source accumulates in `source`;
//! - only newline-terminated source commits into the stable queue
//!   (`queue`), so the pending partial line (the mutable tail) can never
//!   flip in and out of the committed region;
//! - `drain_n`/`step` pull stable lines for display, tracking how many have
//!   been emitted so a finalize re-render never replays them;
//! - `oldest_queued_age` feeds the adaptive chunking policy.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// What changed in the stream after one `push_delta` / `finalize` call.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitUpdate {
    /// Lines that became stable (newline-terminated) during this call.
    #[serde(default)]
    pub committed_lines: Vec<String>,
    /// The current mutable tail (partial line without a trailing newline).
    #[serde(default)]
    pub pending: String,
    /// True once any delta has been pushed; mirrors Codex's `has_seen_delta`.
    #[serde(default)]
    pub has_seen_delta: bool,
}

#[derive(Debug)]
pub struct StreamController {
    source: String,
    queue: VecDeque<String>,
    enqueued_at_ms: VecDeque<u64>,
    pending: String,
    emitted_stable_len: usize,
    has_seen_delta: bool,
}

impl Default for StreamController {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamController {
    pub fn new() -> Self {
        StreamController {
            source: String::new(),
            queue: VecDeque::new(),
            enqueued_at_ms: VecDeque::new(),
            pending: String::new(),
            emitted_stable_len: 0,
            has_seen_delta: false,
        }
    }

    /// Appends a delta and commits every newly complete line.
    ///
    /// `now_ms` stamps the enqueued lines for age-based chunking decisions.
    /// Returns the update with the newly stable lines already queued (the
    /// caller drains them via [`Self::drain_n`] / [`Self::step`]).
    pub fn push_delta(&mut self, delta: &str, now_ms: u64) -> CommitUpdate {
        if !delta.is_empty() {
            self.has_seen_delta = true;
        }
        self.source.push_str(delta);
        self.pending.push_str(delta);

        let mut committed_lines = Vec::new();
        loop {
            let Some(nl) = self.pending.find('\n') else { break };
            let line = self.pending[..nl].strip_suffix('\r').unwrap_or(&self.pending[..nl]).to_owned();
            self.pending.drain(..=nl);
            self.queue.push_back(line.clone());
            self.enqueued_at_ms.push_back(now_ms);
            committed_lines.push(line);
        }

        CommitUpdate {
            committed_lines,
            pending: self.pending.clone(),
            has_seen_delta: self.has_seen_delta,
        }
    }

    /// Drains the stream: everything left in `pending` becomes final lines.
    /// Returns the last lines (the render must not replay already-emitted
    /// stable lines).
    pub fn finalize(&mut self, now_ms: u64) -> CommitUpdate {
        let mut committed_lines = Vec::new();
        if !self.pending.is_empty() {
            let line = std::mem::take(&mut self.pending);
            self.queue.push_back(line.clone());
            self.enqueued_at_ms.push_back(now_ms);
            committed_lines.push(line);
        }
        CommitUpdate {
            committed_lines,
            pending: String::new(),
            has_seen_delta: self.has_seen_delta,
        }
    }

    /// Removes up to `max_lines` stable lines from the queue.
    pub fn drain_n(&mut self, max_lines: usize) -> Vec<String> {
        let mut out = Vec::with_capacity(max_lines.min(self.queue.len()));
        for _ in 0..max_lines {
            let Some(line) = self.queue.pop_front() else { break };
            self.enqueued_at_ms.pop_front();
            self.emitted_stable_len += 1;
            out.push(line);
        }
        out
    }

    /// Steps one stable line out of the queue (Smooth-mode pacing).
    pub fn step(&mut self) -> Vec<String> {
        self.drain_n(1)
    }

    /// Lines enqueued but not yet emitted.
    pub fn queued_len(&self) -> usize {
        self.queue.len()
    }

    /// Age in ms of the oldest queued line, or `None` when the queue is empty.
    pub fn oldest_queued_age_ms(&self, now_ms: u64) -> Option<u64> {
        self.enqueued_at_ms.front().map(|at| now_ms.saturating_sub(*at))
    }

    /// The current mutable tail (partial line).
    pub fn pending(&self) -> &str {
        &self.pending
    }

    pub fn is_idle(&self) -> bool {
        self.queue.is_empty() && self.pending.is_empty()
    }

    /// Number of stable lines already emitted (used to avoid replaying them
    /// after a finalize re-render).
    pub fn emitted_stable_len(&self) -> usize {
        self.emitted_stable_len
    }

    /// Resets the controller for reuse (e.g. the next answer).
    pub fn reset(&mut self) {
        self.source.clear();
        self.queue.clear();
        self.enqueued_at_ms.clear();
        self.pending.clear();
        self.emitted_stable_len = 0;
        self.has_seen_delta = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_line_stays_in_tail_until_newline() {
        let mut c = StreamController::new();
        let u1 = c.push_delta("hel", 0);
        assert!(u1.committed_lines.is_empty());
        assert_eq!(u1.pending, "hel");
        assert_eq!(c.queued_len(), 0);

        let u2 = c.push_delta("lo\nwor", 1);
        assert_eq!(u2.committed_lines, vec!["hello"]);
        assert_eq!(u2.pending, "wor");
        assert_eq!(c.queued_len(), 1);
    }

    #[test]
    fn multiple_lines_commit_in_order() {
        let mut c = StreamController::new();
        let u = c.push_delta("a\nb\nc\n", 0);
        assert_eq!(u.committed_lines, vec!["a", "b", "c"]);
        assert_eq!(c.drain_n(10), vec!["a", "b", "c"]);
        assert!(c.is_idle());
    }

    #[test]
    fn crlf_normalized_on_commit() {
        let mut c = StreamController::new();
        let u = c.push_delta("a\r\nb\r\n", 0);
        assert_eq!(u.committed_lines, vec!["a", "b"]);
    }

    #[test]
    fn finalize_commits_pending_tail() {
        let mut c = StreamController::new();
        c.push_delta("line1\nline2", 0);
        let u = c.finalize(1);
        assert_eq!(u.committed_lines, vec!["line2"]);
        assert_eq!(u.pending, "");
        assert_eq!(c.drain_n(10), vec!["line1", "line2"]);
        assert!(c.is_idle());
    }

    #[test]
    fn finalize_without_pending_is_noop() {
        let mut c = StreamController::new();
        c.push_delta("done\n", 0);
        let u = c.finalize(1);
        assert!(u.committed_lines.is_empty());
        assert_eq!(c.drain_n(10), vec!["done"]);
    }

    #[test]
    fn drain_tracks_emitted_count() {
        let mut c = StreamController::new();
        c.push_delta("a\nb\nc\n", 0);
        assert_eq!(c.step(), vec!["a"]);
        assert_eq!(c.emitted_stable_len(), 1);
        assert_eq!(c.drain_n(1), vec!["b"]);
        assert_eq!(c.emitted_stable_len(), 2);
        assert_eq!(c.queued_len(), 1);
    }

    #[test]
    fn age_tracks_oldest_queued_line() {
        let mut c = StreamController::new();
        c.push_delta("a\n", 100);
        c.push_delta("b\n", 200);
        assert_eq!(c.oldest_queued_age_ms(350), Some(250));
        c.step();
        assert_eq!(c.oldest_queued_age_ms(350), Some(150));
        c.step();
        assert_eq!(c.oldest_queued_age_ms(350), None);
    }

    #[test]
    fn empty_delta_still_marks_has_seen_only_when_nonempty() {
        let mut c = StreamController::new();
        c.push_delta("", 0);
        assert!(!c.has_seen_delta);
        c.push_delta("x", 0);
        assert!(c.has_seen_delta);
    }

    #[test]
    fn reset_reuses_controller() {
        let mut c = StreamController::new();
        c.push_delta("a\n", 0);
        c.drain_n(10);
        c.reset();
        assert!(c.is_idle());
        assert_eq!(c.emitted_stable_len(), 0);
        assert!(!c.has_seen_delta);
        let u = c.push_delta("b\n", 0);
        assert_eq!(u.committed_lines, vec!["b"]);
    }

    #[test]
    fn unicode_partial_lines_are_safe() {
        let mut c = StreamController::new();
        c.push_delta("你好", 0);
        c.push_delta("世界\n", 0);
        assert_eq!(c.drain_n(10), vec!["你好世界"]);
    }
}
