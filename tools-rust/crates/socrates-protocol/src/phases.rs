//! The client-side tool-run phase state machine.
//!
//! Ported from `frontend/src/chat/toolRunState.ts` with exact behavioral
//! parity, including quirks:
//! - `phase_from_progress` lowercases the input before mapping;
//! - `transition` passes unknown phase strings through untouched and keeps
//!   the current phase when the next phase is empty;
//! - the first terminal phase wins;
//! - `summarize` skips null/empty-phase runs and counts every non-terminal
//!   phase as active.

use serde::{Deserialize, Serialize};

/// The seven canonical phases. Values are identity-mapped, exactly like the
/// `TOOL_RUN_PHASES` record in the frontend.
pub const TOOL_RUN_PHASES: [&str; 7] = [
    "queued",
    "preparing",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
];

/// Minimal client-side run record (timestamps stay on the JS side).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolRun {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub tool: String,
    #[serde(default)]
    pub phase: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ToolRunSummary {
    pub total: usize,
    pub active: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub cancelled: usize,
    pub timed_out: usize,
}

pub fn is_terminal(phase: &str) -> bool {
    matches!(phase, "succeeded" | "failed" | "cancelled" | "timed_out")
}

/// Maps a server progress phase string to a client run phase. Unknown
/// inputs (including empty) fall back to `running`.
pub fn phase_from_progress(progress_phase: Option<&str>) -> String {
    let phase = progress_phase.unwrap_or("").to_ascii_lowercase();
    match phase.as_str() {
        "queued" => "queued".to_owned(),
        "ready" | "preparing" | "booting" => "preparing".to_owned(),
        "completed" | "complete" => "succeeded".to_owned(),
        "cancelled" | "skipped" => "cancelled".to_owned(),
        "timeout" => "timed_out".to_owned(),
        // A warning is not terminal: the worker may still produce a result.
        "timeout_warning" => "running".to_owned(),
        "failed" | "error" => "failed".to_owned(),
        _ => "running".to_owned(),
    }
}

/// The first terminal event wins. Returns the phase the run should take
/// next; the JS glue merges it into the run record together with any patch.
pub fn transition(current: &str, next: &str) -> String {
    if is_terminal(current) {
        return current.to_owned();
    }
    match next {
        "queued" | "preparing" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" => {
            next.to_owned()
        }
        "" => current.to_owned(),
        _ => next.to_owned(),
    }
}

/// Counts terminal phases and everything else as active. Null entries are
/// represented by `None` and skipped, matching the frontend's
/// `if (!run || !run.phase) continue`.
pub fn summarize(runs: &[Option<ToolRun>]) -> ToolRunSummary {
    let mut summary = ToolRunSummary {
        total: runs.len(),
        ..ToolRunSummary::default()
    };
    for run in runs.iter().flatten() {
        match run.phase.as_str() {
            "" => {}
            "succeeded" => summary.succeeded += 1,
            "failed" => summary.failed += 1,
            "cancelled" => summary.cancelled += 1,
            "timed_out" => summary.timed_out += 1,
            _ => summary.active += 1,
        }
    }
    summary
}

/* Twin-implementation conformance against the shared fixture consumed by
 * packages/core/src/toolRunConformance.test.ts. Kept in its own module so the
 * hand-ported cases below and the shared cases cannot be confused. */
#[cfg(test)]
#[path = "conformance.rs"]
mod conformance;

#[cfg(test)]
mod tests {
    use super::*;

    // Ported 1:1 from frontend/test/toolRunState.test.mjs.

    #[test]
    fn keeps_the_first_terminal_result() {
        let running = ToolRun {
            id: "run-1".into(),
            phase: "running".into(),
            ..ToolRun::default()
        };
        let failed_phase = transition(&running.phase, "failed");
        let late_success = transition(&failed_phase, "succeeded");
        assert_eq!(failed_phase, "failed");
        assert_eq!(late_success, "failed"); // first terminal wins
    }

    #[test]
    fn timeout_warnings_remain_active_until_a_terminal_result() {
        assert_eq!(phase_from_progress(Some("timeout_warning")), "running");
        assert_eq!(phase_from_progress(Some("timeout")), "timed_out");
    }

    #[test]
    fn summaries_distinguish_active_completed_and_failed() {
        let runs = [
            Some(ToolRun { phase: "running".into(), ..ToolRun::default() }),
            Some(ToolRun { phase: "succeeded".into(), ..ToolRun::default() }),
            Some(ToolRun { phase: "failed".into(), ..ToolRun::default() }),
        ];
        assert_eq!(
            summarize(&runs),
            ToolRunSummary { total: 3, active: 1, succeeded: 1, failed: 1, cancelled: 0, timed_out: 0 }
        );
    }

    // Additional parity cases beyond the ported file.

    #[test]
    fn phase_from_progress_mapping_table() {
        for (input, expected) in [
            ("queued", "queued"),
            ("ready", "preparing"),
            ("preparing", "preparing"),
            ("booting", "preparing"),
            ("completed", "succeeded"),
            ("complete", "succeeded"),
            ("cancelled", "cancelled"),
            ("skipped", "cancelled"),
            ("timeout", "timed_out"),
            ("failed", "failed"),
            ("error", "failed"),
            ("mystery_phase", "running"),
            ("", "running"),
        ] {
            assert_eq!(phase_from_progress(Some(input)), expected, "input {input:?}");
        }
        assert_eq!(phase_from_progress(None), "running");
    }

    #[test]
    fn phase_from_progress_lowercases_input() {
        assert_eq!(phase_from_progress(Some("COMPLETED")), "succeeded");
        assert_eq!(phase_from_progress(Some("Timeout")), "timed_out");
    }

    #[test]
    fn transition_passes_unknown_phases_through() {
        assert_eq!(transition("running", "bogus"), "bogus");
        assert_eq!(transition("running", ""), "running");
    }

    #[test]
    fn transition_is_identity_for_known_phases() {
        for phase in TOOL_RUN_PHASES {
            assert_eq!(transition("running", phase), phase, "phase {phase:?}");
        }
    }

    #[test]
    fn summarize_skips_null_and_empty_phase_runs() {
        let runs = [
            None,
            Some(ToolRun { phase: "".into(), ..ToolRun::default() }),
            Some(ToolRun { phase: "cancelled".into(), ..ToolRun::default() }),
            Some(ToolRun { phase: "timed_out".into(), ..ToolRun::default() }),
        ];
        let s = summarize(&runs);
        assert_eq!(s.total, 4);
        assert_eq!(s.cancelled, 1);
        assert_eq!(s.timed_out, 1);
        assert_eq!(s.active, 0);
    }

    #[test]
    fn summarize_unknown_phase_counts_as_active() {
        let runs = [Some(ToolRun { phase: "bogus".into(), ..ToolRun::default() })];
        assert_eq!(summarize(&runs).active, 1);
    }
}
