//! Adaptive chunking policy — two-gear commit pacing with hysteresis.
//!
//! Port of Codex's `AdaptiveChunkingPolicy`
//! (`codex-rs/tui/src/streaming/chunking.rs`): in Smooth mode one queued
//! line drains per commit tick; when queue pressure rises it switches to
//! CatchUp and drains the backlog. Transitions use hysteresis and re-entry
//! holds to avoid gear-flapping near thresholds.
//!
//! The policy depends only on the queue snapshot (depth + oldest age), so
//! it is source-agnostic. Ages and thresholds are `u64` milliseconds.

use serde::{Deserialize, Serialize};

/// Queue-depth threshold that allows entering catch-up mode.
pub const ENTER_QUEUE_DEPTH_LINES: usize = 8;
/// Oldest-line age threshold (ms) that allows entering catch-up mode.
pub const ENTER_OLDEST_AGE_MS: u64 = 120;
/// Queue-depth threshold for starting exit hysteresis.
pub const EXIT_QUEUE_DEPTH_LINES: usize = 2;
/// Oldest-line age threshold (ms) for starting exit hysteresis.
pub const EXIT_OLDEST_AGE_MS: u64 = 40;
/// Minimum duration (ms) below exit thresholds before leaving catch-up.
pub const EXIT_HOLD_MS: u64 = 250;
/// Cooldown (ms) after a catch-up exit that suppresses immediate re-entry.
pub const REENTER_CATCH_UP_HOLD_MS: u64 = 250;
/// Depth cutoff marking backlog as severe (bypasses the re-entry hold).
pub const SEVERE_QUEUE_DEPTH_LINES: usize = 64;
/// Age cutoff (ms) marking backlog as severe.
pub const SEVERE_OLDEST_AGE_MS: u64 = 300;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ChunkingMode {
    /// Drain one line per baseline commit tick.
    #[default]
    Smooth,
    /// Drain multiple lines per tick according to queue pressure.
    CatchUp,
}

/// Queue pressure inputs for a chunking decision.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub queued_lines: usize,
    pub oldest_age_ms: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DrainPlan {
    /// Emit exactly one queued line.
    Single,
    /// Emit up to `usize` queued lines.
    Batch(usize),
}

/// One policy decision for a queue snapshot.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChunkingDecision {
    pub mode: ChunkingMode,
    /// True on the transition tick from Smooth into CatchUp.
    pub entered_catch_up: bool,
    pub drain_plan: DrainPlan,
}

#[derive(Debug, Default)]
pub struct AdaptiveChunkingPolicy {
    mode: ChunkingMode,
    below_exit_threshold_since_ms: Option<u64>,
    last_catch_up_exit_at_ms: Option<u64>,
}

impl AdaptiveChunkingPolicy {
    pub fn mode(&self) -> ChunkingMode {
        self.mode
    }

    pub fn reset(&mut self) {
        self.mode = ChunkingMode::Smooth;
        self.below_exit_threshold_since_ms = None;
        self.last_catch_up_exit_at_ms = None;
    }

    /// Computes a drain decision from the current queue snapshot.
    ///
    /// Deterministic for a given `(mode, snapshot, now_ms)` triple.
    pub fn decide(&mut self, snapshot: QueueSnapshot, now_ms: u64) -> ChunkingDecision {
        if snapshot.queued_lines == 0 {
            self.note_catch_up_exit(now_ms);
            self.mode = ChunkingMode::Smooth;
            self.below_exit_threshold_since_ms = None;
            return ChunkingDecision {
                mode: self.mode,
                entered_catch_up: false,
                drain_plan: DrainPlan::Single,
            };
        }

        let entered_catch_up = match self.mode {
            ChunkingMode::Smooth => self.maybe_enter_catch_up(snapshot, now_ms),
            ChunkingMode::CatchUp => {
                self.maybe_exit_catch_up(snapshot, now_ms);
                false
            }
        };

        let drain_plan = match self.mode {
            ChunkingMode::Smooth => DrainPlan::Single,
            ChunkingMode::CatchUp => DrainPlan::Batch(snapshot.queued_lines.max(1)),
        };

        ChunkingDecision {
            mode: self.mode,
            entered_catch_up,
            drain_plan,
        }
    }

    fn maybe_enter_catch_up(&mut self, snapshot: QueueSnapshot, now_ms: u64) -> bool {
        if !should_enter_catch_up(snapshot) {
            return false;
        }
        if self.reentry_hold_active(now_ms) && !is_severe_backlog(snapshot) {
            return false;
        }
        self.mode = ChunkingMode::CatchUp;
        self.below_exit_threshold_since_ms = None;
        self.last_catch_up_exit_at_ms = None;
        true
    }

    fn maybe_exit_catch_up(&mut self, snapshot: QueueSnapshot, now_ms: u64) {
        if !should_exit_catch_up(snapshot) {
            self.below_exit_threshold_since_ms = None;
            return;
        }
        match self.below_exit_threshold_since_ms {
            Some(since) if now_ms.saturating_sub(since) >= EXIT_HOLD_MS => {
                self.mode = ChunkingMode::Smooth;
                self.below_exit_threshold_since_ms = None;
                self.last_catch_up_exit_at_ms = Some(now_ms);
            }
            Some(_) => {}
            None => {
                self.below_exit_threshold_since_ms = Some(now_ms);
            }
        }
    }

    fn note_catch_up_exit(&mut self, now_ms: u64) {
        if self.mode == ChunkingMode::CatchUp {
            self.last_catch_up_exit_at_ms = Some(now_ms);
        }
    }

    fn reentry_hold_active(&self, now_ms: u64) -> bool {
        self.last_catch_up_exit_at_ms
            .is_some_and(|exit| now_ms.saturating_sub(exit) < REENTER_CATCH_UP_HOLD_MS)
    }
}

/// Either depth or age pressure is sufficient to trigger catch-up.
fn should_enter_catch_up(snapshot: QueueSnapshot) -> bool {
    snapshot.queued_lines >= ENTER_QUEUE_DEPTH_LINES
        || snapshot.oldest_age_ms.is_some_and(|age| age >= ENTER_OLDEST_AGE_MS)
}

/// Both depth and age must be below thresholds; this prevents oscillation
/// when one signal is still under load.
fn should_exit_catch_up(snapshot: QueueSnapshot) -> bool {
    snapshot.queued_lines <= EXIT_QUEUE_DEPTH_LINES
        && snapshot.oldest_age_ms.is_some_and(|age| age <= EXIT_OLDEST_AGE_MS)
}

/// Severe pressure bypasses the re-entry hold to avoid queue-age growth.
fn is_severe_backlog(snapshot: QueueSnapshot) -> bool {
    snapshot.queued_lines >= SEVERE_QUEUE_DEPTH_LINES
        || snapshot.oldest_age_ms.is_some_and(|age| age >= SEVERE_OLDEST_AGE_MS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(queued_lines: usize, oldest_age_ms: u64) -> QueueSnapshot {
        QueueSnapshot {
            queued_lines,
            oldest_age_ms: Some(oldest_age_ms),
        }
    }

    #[test]
    fn smooth_mode_is_default() {
        let mut policy = AdaptiveChunkingPolicy::default();
        let decision = policy.decide(snapshot(1, 10), 0);
        assert_eq!(decision.mode, ChunkingMode::Smooth);
        assert!(!decision.entered_catch_up);
        assert_eq!(decision.drain_plan, DrainPlan::Single);
    }

    #[test]
    fn enters_catch_up_on_depth_threshold() {
        let mut policy = AdaptiveChunkingPolicy::default();
        let decision = policy.decide(snapshot(8, 10), 0);
        assert_eq!(decision.mode, ChunkingMode::CatchUp);
        assert!(decision.entered_catch_up);
        assert_eq!(decision.drain_plan, DrainPlan::Batch(8));
    }

    #[test]
    fn enters_catch_up_on_age_threshold() {
        let mut policy = AdaptiveChunkingPolicy::default();
        let decision = policy.decide(snapshot(2, 120), 0);
        assert_eq!(decision.mode, ChunkingMode::CatchUp);
        assert!(decision.entered_catch_up);
        assert_eq!(decision.drain_plan, DrainPlan::Batch(2));
    }

    #[test]
    fn empty_queue_resets_to_smooth() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(8, 10), 0);
        let decision = policy.decide(snapshot(0, 0), 5);
        assert_eq!(decision.mode, ChunkingMode::Smooth);
        assert!(!decision.entered_catch_up);
    }

    #[test]
    fn exit_requires_hold_window() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(9, 10), 0); // enter catch-up
        // Pressure drops below exit thresholds: the hold window starts but
        // the mode does not flip on this tick.
        let decision = policy.decide(snapshot(2, 30), 100);
        assert_eq!(decision.mode, ChunkingMode::CatchUp);
        // After the full EXIT_HOLD elapses the policy returns to Smooth.
        let decision = policy.decide(snapshot(2, 30), 100 + EXIT_HOLD_MS);
        assert_eq!(decision.mode, ChunkingMode::Smooth);
        assert_eq!(decision.drain_plan, DrainPlan::Single);
    }

    #[test]
    fn reentry_hold_suppresses_immediate_reentry() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(9, 10), 0); // enter catch-up
        policy.decide(snapshot(2, 30), 100); // start exit hold
        policy.decide(snapshot(2, 30), 100 + EXIT_HOLD_MS); // exit to smooth
        // Pressure rises again within the re-entry hold → stays smooth.
        let decision = policy.decide(snapshot(9, 10), 100 + EXIT_HOLD_MS + 50);
        assert_eq!(decision.mode, ChunkingMode::Smooth);
        // After the hold expires re-entry is allowed.
        let decision = policy.decide(snapshot(9, 10), 100 + EXIT_HOLD_MS + REENTER_CATCH_UP_HOLD_MS + 1);
        assert_eq!(decision.mode, ChunkingMode::CatchUp);
        assert!(decision.entered_catch_up);
    }

    #[test]
    fn severe_backlog_bypasses_reentry_hold() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(9, 10), 0); // enter catch-up
        policy.decide(snapshot(2, 30), 100); // start exit hold
        policy.decide(snapshot(2, 30), 100 + EXIT_HOLD_MS); // exit to smooth
        // Severe depth within the re-entry hold still re-enters.
        let decision = policy.decide(snapshot(SEVERE_QUEUE_DEPTH_LINES, 10), 100 + EXIT_HOLD_MS + 50);
        assert_eq!(decision.mode, ChunkingMode::CatchUp);
        assert!(decision.entered_catch_up);
    }

    #[test]
    fn catch_up_drains_batch_plan() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(8, 10), 0);
        let decision = policy.decide(snapshot(20, 200), 5);
        assert_eq!(decision.drain_plan, DrainPlan::Batch(20));
    }

    #[test]
    fn pressure_returns_under_load_never_exits() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(8, 10), 0);
        // Depth above exit threshold → stay in catch-up forever.
        let decision = policy.decide(snapshot(5, 30), 10_000);
        assert_eq!(decision.mode, ChunkingMode::CatchUp);
    }

    #[test]
    fn reset_returns_to_baseline() {
        let mut policy = AdaptiveChunkingPolicy::default();
        policy.decide(snapshot(8, 10), 0);
        policy.reset();
        assert_eq!(policy.mode(), ChunkingMode::Smooth);
        let decision = policy.decide(snapshot(1, 10), 0);
        assert_eq!(decision.mode, ChunkingMode::Smooth);
    }
}
