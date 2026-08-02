//! Bounded incremental output buffer.
//!
//! Port of Codex's `LiveCommandOutput` (`exec_cell/live_output.rs`): keep a
//! bounded preview (head + tail rings, byte cap) while counting everything
//! that had to be dropped, so a long-running tool's output never grows the
//! DOM unboundedly and the display can show "… N bytes omitted".
//!
//! `push` accepts arbitrary chunk boundaries (a chunk may end mid-line); the
//! partial line is held in `pending` and included in the preview.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// A point-in-time bounded view of the streamed output.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LivePreview {
    #[serde(default)]
    pub head: Vec<String>,
    #[serde(default)]
    pub tail: Vec<String>,
    /// Line still being assembled (no trailing newline yet).
    #[serde(default)]
    pub pending: String,
    /// Complete lines dropped from the middle.
    #[serde(default)]
    pub omitted_lines: usize,
    /// Bytes dropped from the middle (content that was counted away).
    #[serde(default)]
    pub omitted_bytes: usize,
    /// All bytes received, including dropped ones.
    #[serde(default)]
    pub total_bytes: usize,
    #[serde(default)]
    pub total_lines: usize,
}

#[derive(Clone, Debug)]
pub struct LiveBuffer {
    head: Vec<String>,
    tail: VecDeque<String>,
    pending: String,
    omitted_lines: usize,
    omitted_bytes: usize,
    stored_bytes: usize,
    total_bytes: usize,
    total_lines: usize,
    max_lines: usize,
    max_bytes: usize,
}

/// Defaults mirror Codex: 50 preview lines and a 1 MiB cap per call.
pub const DEFAULT_MAX_LINES: usize = 50;
pub const DEFAULT_MAX_BYTES: usize = 1024 * 1024;

impl LiveBuffer {
    pub fn new(max_lines: usize, max_bytes: usize) -> Self {
        LiveBuffer {
            head: Vec::new(),
            tail: VecDeque::new(),
            pending: String::new(),
            omitted_lines: 0,
            omitted_bytes: 0,
            stored_bytes: 0,
            total_bytes: 0,
            total_lines: 0,
            max_lines: max_lines.max(1),
            max_bytes: max_bytes.max(1),
        }
    }

    /// Appends a chunk, completing lines on `\n` (CRLF normalized).
    pub fn push(&mut self, chunk: &str) {
        self.total_bytes += chunk.len();
        self.pending.push_str(chunk);
        loop {
            let Some(nl) = self.pending.find('\n') else { break };
            let line = self.pending[..nl].strip_suffix('\r').unwrap_or(&self.pending[..nl]).to_owned();
            self.pending.drain(..=nl);
            self.complete_line(line);
        }
    }

    fn complete_line(&mut self, line: String) {
        self.total_lines += 1;
        let len = line.len();
        if self.stored_bytes + len > self.max_bytes {
            self.omitted_lines += 1;
            self.omitted_bytes += len;
            return;
        }
        if self.head.len() < self.max_lines {
            self.stored_bytes += len;
            self.head.push(line);
            return;
        }
        if self.tail.len() < self.max_lines {
            self.stored_bytes += len;
            self.tail.push_back(line);
            return;
        }
        // Head is full and the tail ring is full: evict the tail's oldest
        // line so the ring keeps the most recent output; the evicted line
        // counts as omitted.
        let evicted = self.tail.pop_front().expect("tail is full");
        self.tail.push_back(line);
        self.omitted_lines += 1;
        self.omitted_bytes += evicted.len();
    }

    /// The bounded preview: head, then tail, then the pending partial line.
    pub fn preview(&self) -> LivePreview {
        LivePreview {
            head: self.head.clone(),
            tail: self.tail.iter().cloned().collect(),
            pending: self.pending.clone(),
            omitted_lines: self.omitted_lines,
            omitted_bytes: self.omitted_bytes,
            total_bytes: self.total_bytes,
            total_lines: self.total_lines,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buffer(lines_cap: usize) -> LiveBuffer {
        LiveBuffer::new(lines_cap, 10_000)
    }

    #[test]
    fn chunks_with_partial_lines_accumulate() {
        let mut b = buffer(50);
        b.push("hel");
        b.push("lo\nworld\n");
        b.push("tail");
        let p = b.preview();
        assert_eq!(p.head, vec!["hello", "world"]);
        assert_eq!(p.pending, "tail");
        assert_eq!(p.total_lines, 2);
        assert_eq!(p.omitted_lines, 0);
    }

    #[test]
    fn middle_lines_are_omitted_and_counted() {
        let mut b = buffer(2);
        for i in 1..=10 {
            b.push(&format!("line {i}\n"));
        }
        let p = b.preview();
        assert_eq!(p.head, vec!["line 1", "line 2"]);
        assert_eq!(p.tail, vec!["line 9", "line 10"]);
        assert_eq!(p.omitted_lines, 6);
        assert_eq!(p.total_lines, 10);
    }

    #[test]
    fn byte_cap_omits_overflowing_lines() {
        // 10-byte lines; 32-byte cap stores 3 lines (30 bytes), the rest
        // are counted away.
        let mut b = LiveBuffer::new(50, 32);
        b.push("0123456789\n0123456789\n0123456789\n0123456789\n0123456789\n");
        let p = b.preview();
        assert_eq!(p.head.len(), 3);
        assert_eq!(p.omitted_lines, 2);
        assert_eq!(p.omitted_bytes, 20);
        assert_eq!(p.total_bytes, 55);
    }

    #[test]
    fn crlf_normalized() {
        let mut b = buffer(50);
        b.push("a\r\nb\r\n");
        assert_eq!(b.preview().head, vec!["a", "b"]);
    }

    #[test]
    fn empty_chunks_are_noops() {
        let mut b = buffer(50);
        b.push("");
        b.push("\n");
        let p = b.preview();
        assert_eq!(p.head, vec![""]);
        assert_eq!(p.total_lines, 1);
    }

    #[test]
    fn unicode_chunks_do_not_split_graphemes() {
        let mut b = buffer(50);
        b.push("你好");
        b.push("世界\n");
        let p = b.preview();
        assert_eq!(p.head, vec!["你好世界"]);
    }

    #[test]
    fn preview_reflects_live_state() {
        let mut b = buffer(2);
        b.push("a\nb\nc\nd\n");
        let p = b.preview();
        assert_eq!(p.head, vec!["a", "b"]);
        assert_eq!(p.tail, vec!["c", "d"]);
        assert_eq!(p.total_bytes, 8);
        assert_eq!(p.total_lines, 4);
    }
}
