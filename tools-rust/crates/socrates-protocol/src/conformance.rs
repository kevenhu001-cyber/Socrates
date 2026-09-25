//! Conformance tests against the shared twin fixture.
//!
//! The ToolRun phase state machine is implemented twice: here, and in
//! `packages/core/src/toolRun.ts`. The Rust version compiles to the WASM the
//! web SPA prefers when it loads; the TypeScript version is the fallback and
//! is what mobile uses. A divergence between them is a bug that reproduces on
//! some clients and not others.
//!
//! Before this module the only thing keeping them aligned was a human copying
//! cases between files — the tests in `phases.rs` still carry the comment
//! "Ported 1:1 from frontend/test/toolRunState.test.mjs". Both sides now read
//! `packages/contracts/toolRunConformance.fixture.json` and assert against the
//! same expected values, so changing one implementation fails the other.
//!
//! Adding a case to the fixture obliges both implementations.

use serde::Deserialize;

use super::{is_terminal, phase_from_progress, summarize, transition, ToolRun, TOOL_RUN_PHASES};

#[derive(Deserialize)]
struct TerminalCase {
    phase: String,
    expected: bool,
}

#[derive(Deserialize)]
struct ProgressCase {
    input: String,
    expected: String,
    #[serde(default)]
    why: Option<String>,
}

#[derive(Deserialize)]
struct TransitionCase {
    current: String,
    next: String,
    expected: String,
    #[serde(default)]
    why: Option<String>,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
struct SummaryExpectation {
    total: usize,
    succeeded: usize,
    failed: usize,
    cancelled: usize,
    timed_out: usize,
    active: usize,
}

#[derive(Deserialize)]
struct SummarizeCase {
    runs: Vec<Option<String>>,
    expected: SummaryExpectation,
    #[serde(default)]
    why: Option<String>,
}

#[derive(Deserialize)]
struct Fixture {
    phases: std::collections::BTreeMap<String, String>,
    #[serde(rename = "isTerminal")]
    is_terminal: Vec<TerminalCase>,
    #[serde(rename = "phaseFromProgress")]
    phase_from_progress: Vec<ProgressCase>,
    transition: Vec<TransitionCase>,
    summarize: Vec<SummarizeCase>,
}

/// Located relative to this source file so the test does not depend on the
/// working directory `cargo test` happens to be invoked from.
fn load_fixture() -> Fixture {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/contracts/toolRunConformance.fixture.json"
    );
    let raw = std::fs::read_to_string(path).unwrap_or_else(|err| {
        panic!(
            "cannot read the shared conformance fixture at {path}: {err}. \
             Both twin implementations must read the same file; do not inline \
             a copy of the cases here."
        )
    });
    serde_json::from_str(&raw).expect("shared conformance fixture is not valid JSON")
}

#[test]
fn phase_vocabulary_matches_the_fixture() {
    let fixture = load_fixture();
    // Both implementations hard-code this list; if it drifts, every case below
    // becomes untrustworthy.
    for name in TOOL_RUN_PHASES {
        assert_eq!(
            fixture.phases.get(name).map(String::as_str),
            Some(name),
            "phase {name:?} is missing from or renamed in the shared fixture"
        );
    }
    assert_eq!(
        fixture.phases.len(),
        TOOL_RUN_PHASES.len(),
        "the fixture declares {} phases but this crate declares {}",
        fixture.phases.len(),
        TOOL_RUN_PHASES.len()
    );
}

#[test]
fn is_terminal_matches_the_fixture() {
    for case in load_fixture().is_terminal {
        assert_eq!(
            is_terminal(&case.phase),
            case.expected,
            "is_terminal({:?}) diverged from the shared fixture",
            case.phase
        );
    }
}

#[test]
fn phase_from_progress_matches_the_fixture() {
    for case in load_fixture().phase_from_progress {
        let got = phase_from_progress(Some(&case.input));
        assert_eq!(
            got,
            case.expected,
            "phase_from_progress({:?}) returned {:?}, fixture expects {:?}{}",
            case.input,
            got,
            case.expected,
            case.why.map(|w| format!(" — {w}")).unwrap_or_default()
        );
    }
}

#[test]
fn phase_from_progress_handles_absent_input_like_the_ts_twin() {
    // The TS side is called with a possibly-null progress object; `None` here
    // is the same situation and must not panic or produce an empty phase.
    assert_eq!(phase_from_progress(None), "running");
}

#[test]
fn transition_matches_the_fixture() {
    for case in load_fixture().transition {
        let got = transition(&case.current, &case.next);
        assert_eq!(
            got,
            case.expected,
            "transition({:?}, {:?}) returned {:?}, fixture expects {:?}{}",
            case.current,
            case.next,
            got,
            case.expected,
            case.why.map(|w| format!(" — {w}")).unwrap_or_default()
        );
    }
}

#[test]
fn summarize_matches_the_fixture() {
    for (i, case) in load_fixture().summarize.into_iter().enumerate() {
        let runs: Vec<Option<ToolRun>> = case
            .runs
            .iter()
            .map(|phase| {
                phase.as_ref().map(|p| ToolRun {
                    id: "r".into(),
                    phase: p.clone(),
                    ..ToolRun::default()
                })
            })
            .collect();
        let got = summarize(&runs);
        let actual = SummaryExpectation {
            total: got.total,
            succeeded: got.succeeded,
            failed: got.failed,
            cancelled: got.cancelled,
            timed_out: got.timed_out,
            active: got.active,
        };
        assert_eq!(
            actual,
            case.expected,
            "summarize case {i} diverged from the shared fixture{}",
            case.why.map(|w| format!(" — {w}")).unwrap_or_default()
        );
    }
}
