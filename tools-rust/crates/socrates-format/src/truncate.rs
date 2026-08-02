//! Line-aware head/tail truncation.
//!
//! Port of `codex-rs/tui/src/exec_cell/render.rs::output_lines`: keep the
//! first `head` lines and the last `tail` lines, report how many lines in
//! between were omitted. The ellipsis row itself ("… +N lines …") is a
//! presentation concern, so it is rendered by the caller using the returned
//! `omitted_lines` count — this keeps the library free of UI/i18n strings.

use serde::{Deserialize, Serialize};

/// Result of a truncation: the retained lines plus the omitted count.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TruncatedOutput {
    /// Head lines followed by tail lines (no ellipsis marker row).
    #[serde(default)]
    pub lines: Vec<String>,
    /// Number of middle lines dropped; zero when nothing was omitted.
    #[serde(default)]
    pub omitted_lines: usize,
}

/// Splits `text` into display lines: CRLF is normalized, a trailing newline
/// does not produce a spurious empty line, and interior empty lines are kept.
fn split_lines(text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<String> = text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l).to_owned()).collect();
    if lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines
}

/// Keeps the first `head` and last `tail` lines of `text`, reporting the
/// count of omitted middle lines. Mirrors Codex's
/// `output_lines`: `head_end = min(total, head)`,
/// `tail_len = min(total - head_end, tail)`,
/// `omitted = total - head_end - tail_len`.
pub fn truncate_lines(text: &str, head: usize, tail: usize) -> TruncatedOutput {
    let total = split_lines(text);
    let head_end = total.len().min(head);
    let tail_len = total.len().saturating_sub(head_end).min(tail);
    let omitted = total.len().saturating_sub(head_end + tail_len);

    let mut lines = Vec::with_capacity(head_end + tail_len);
    lines.extend_from_slice(&total[..head_end]);
    if tail_len > 0 {
        let tail_start = total.len() - tail_len;
        lines.extend_from_slice(&total[tail_start..]);
    }

    TruncatedOutput {
        lines,
        omitted_lines: omitted,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_text_is_untouched() {
        let out = truncate_lines("one\ntwo\nthree", 5, 5);
        assert_eq!(out.lines, vec!["one", "two", "three"]);
        assert_eq!(out.omitted_lines, 0);
    }

    #[test]
    fn single_line_passes_through() {
        let out = truncate_lines("a single line without newlines", 5, 5);
        assert_eq!(out.lines, vec!["a single line without newlines"]);
        assert_eq!(out.omitted_lines, 0);
    }

    #[test]
    fn head_tail_with_omitted_middle() {
        // 12 lines, head=5, tail=5 → head 1-5, tail 8-12, 2 omitted
        // (Codex TOOL_CALL_MAX_LINES behavior: up to 2*line_limit lines).
        let text = (1..=12).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let out = truncate_lines(&text, 5, 5);
        assert_eq!(out.lines.len(), 10);
        assert_eq!(out.lines[0], "line 1");
        assert_eq!(out.lines[4], "line 5");
        assert_eq!(out.lines[5], "line 8");
        assert_eq!(out.lines[9], "line 12");
        assert_eq!(out.omitted_lines, 2);
    }

    #[test]
    fn exactly_at_limit_omits_nothing() {
        let text = (1..=10).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let out = truncate_lines(&text, 5, 5);
        assert_eq!(out.lines.len(), 10);
        assert_eq!(out.omitted_lines, 0);
    }

    #[test]
    fn one_more_than_limit_omits_one() {
        let text = (1..=11).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let out = truncate_lines(&text, 5, 5);
        assert_eq!(out.lines.len(), 10);
        assert_eq!(out.omitted_lines, 1);
    }

    #[test]
    fn asymmetric_head_tail() {
        let text = (1..=10).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let out = truncate_lines(&text, 2, 4);
        assert_eq!(out.lines, vec!["line 1", "line 2", "line 7", "line 8", "line 9", "line 10"]);
        assert_eq!(out.omitted_lines, 4);
    }

    #[test]
    fn zero_limits_keep_tail_only() {
        let text = (1..=3).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let out = truncate_lines(&text, 0, 2);
        assert_eq!(out.lines, vec!["line 2", "line 3"]);
        assert_eq!(out.omitted_lines, 1);
    }

    #[test]
    fn crlf_and_trailing_newline_normalized() {
        let out = truncate_lines("a\r\nb\r\nc\r\n", 5, 5);
        assert_eq!(out.lines, vec!["a", "b", "c"]);
        assert_eq!(out.omitted_lines, 0);
    }

    #[test]
    fn interior_empty_lines_kept_trailing_dropped() {
        let out = truncate_lines("a\n\nb\n", 5, 5);
        assert_eq!(out.lines, vec!["a", "", "b"]);
    }

    #[test]
    fn empty_text_yields_nothing() {
        let out = truncate_lines("", 5, 5);
        assert!(out.lines.is_empty());
        assert_eq!(out.omitted_lines, 0);
    }

    #[test]
    fn unicode_lines_count_as_lines() {
        let text = "第一行\n第二行\n第三行".to_owned();
        let out = truncate_lines(&text, 1, 1);
        assert_eq!(out.lines, vec!["第一行", "第三行"]);
        assert_eq!(out.omitted_lines, 1);
    }
}
