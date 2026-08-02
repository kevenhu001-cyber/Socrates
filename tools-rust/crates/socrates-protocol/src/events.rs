//! Serde models for the chat-stream SSE tool events.
//!
//! Wire shapes are copied from `server/src/routes/chat/stream.ts` (the
//! `event: tool_call_delta / tool_use / execution_start / tool_progress /
//! tool_result` frames). All optional fields use `#[serde(default)]` so a
//! partial frame deserializes instead of failing — mirroring the server's
//! `|| ''` / `|| 0` fallbacks.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// `event: tool_call_delta` — incremental accumulation of one function call.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallDelta {
    /// Streaming index of the call within the turn.
    pub index: u32,
    pub id: Option<String>,
    pub name: Option<String>,
    /// Cumulative JSON arguments so far (empty string as a fallback).
    #[serde(default)]
    pub arguments: String,
    /// True when this is the last delta for the call.
    #[serde(default, rename = "final")]
    pub is_final: bool,
}

/// One element of the `event: tool_use` array — a completed call the server
/// is about to execute.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolUse {
    pub id: String,
    pub name: Option<String>,
    /// Parsed argument object; `{}` when the arguments did not parse.
    #[serde(default)]
    pub input: Value,
}

/// `event: execution_start` — a long-running execution (code interpreter)
/// got an execution id.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStart {
    pub id: String,
    pub execution_id: String,
}

/// `event: tool_progress` — live output chunk for a running tool.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolProgress {
    pub id: String,
    /// Server phase: queued / ready / timeout_warning / failed / completed /
    /// skipped. See `codeInterpreter.ts`.
    pub phase: Option<String>,
    /// Channel: stdout / stderr / phase.
    pub stream: Option<String>,
    #[serde(default)]
    pub chunk: String,
    #[serde(default)]
    pub elapsed_ms: u64,
}

/// One artifact attached to a tool result.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub name: Option<String>,
    pub mime_type: Option<String>,
}

/// One web search hit (`results[]` of `tool_result`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: Option<String>,
    pub url: Option<String>,
    pub snippet: Option<String>,
    pub date: Option<String>,
    pub source: Option<String>,
    pub matched_query: Option<String>,
}

/// `visualization` payload of `tool_result` (render_visualization).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VisualizationSpec {
    pub template: Option<String>,
    pub title: Option<String>,
    pub payload: Option<Value>,
}

/// `plan` payload of `tool_result` (create_plan).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanSpec {
    pub title: Option<String>,
    #[serde(default)]
    pub steps: Vec<Value>,
}

/// `spec` payload of `tool_result` (create_spec).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpecSpec {
    pub title: Option<String>,
    #[serde(default)]
    pub requirements: Vec<Value>,
}

/// `event: tool_result` — the terminal outcome of one tool call.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub id: String,
    /// `status === 'completed'`.
    #[serde(default)]
    pub ok: bool,
    /// completed / failed / timeout / cancelled / skipped.
    pub status: Option<String>,
    pub name: Option<String>,
    pub output: Option<String>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub error: Option<String>,
    /// invalid_tool_arguments / tool_not_available / execution_timeout /
    /// web_search_failed / unknown_tool / …
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub retryable: Option<bool>,
    /// User-facing (Chinese) message.
    pub user_message: Option<String>,
    /// Free-form diagnostic payload (stderr or an object).
    pub detail: Option<Value>,
    #[serde(default)]
    pub artifacts: Vec<Artifact>,
    pub execution_id: Option<String>,
    pub duration_ms: Option<u64>,
    pub visualization: Option<VisualizationSpec>,
    pub plan: Option<PlanSpec>,
    pub spec: Option<SpecSpec>,
    #[serde(default)]
    pub results: Vec<SearchResult>,
    /// web_fetch success branch.
    pub url: Option<String>,
    pub title: Option<String>,
    pub truncated: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse<T: for<'de> serde::Deserialize<'de>>(json: &str) -> T {
        serde_json::from_str(json).expect("frame should parse")
    }

    #[test]
    fn tool_call_delta_maps_wire_fields() {
        let d: ToolCallDelta = parse(r#"{"index":2,"id":"call_1","name":"web_search","arguments":"{\"q\":\"a","final":true}"#);
        assert_eq!(d.index, 2);
        assert_eq!(d.id.as_deref(), Some("call_1"));
        assert_eq!(d.name.as_deref(), Some("web_search"));
        assert_eq!(d.arguments, r#"{"q":"a"#);
        assert!(d.is_final);
    }

    #[test]
    fn tool_call_delta_partial_frame_gets_defaults() {
        // Server always emits index; the rest may be absent.
        let d: ToolCallDelta = parse(r#"{"index":0}"#);
        assert_eq!(d.index, 0);
        assert_eq!(d.id, None);
        assert_eq!(d.name, None);
        assert_eq!(d.arguments, "");
        assert!(!d.is_final);
    }

    #[test]
    fn tool_use_parses_input_object() {
        let u: ToolUse = parse(r#"{"id":"call_2","name":"web_search","input":{"query":"rust"}}"#);
        assert_eq!(u.id, "call_2");
        assert_eq!(u.input["query"], serde_json::json!("rust"));
    }

    #[test]
    fn tool_use_without_name_or_input() {
        let u: ToolUse = parse(r#"{"id":"call_3"}"#);
        assert_eq!(u.name, None);
        // serde's default for a missing Value is Null (absent input).
        assert_eq!(u.input, serde_json::Value::Null);
    }

    #[test]
    fn execution_start_fields() {
        let e: ExecutionStart = parse(r#"{"id":"call_4","executionId":"ex_9"}"#);
        assert_eq!(e.id, "call_4");
        assert_eq!(e.execution_id, "ex_9");
    }

    #[test]
    fn tool_progress_maps_elapsed_ms_and_stream() {
        let p: ToolProgress = parse(r#"{"id":"call_5","phase":"ready","stream":"stdout","chunk":"hello","elapsedMs":1234}"#);
        assert_eq!(p.phase.as_deref(), Some("ready"));
        assert_eq!(p.stream.as_deref(), Some("stdout"));
        assert_eq!(p.chunk, "hello");
        assert_eq!(p.elapsed_ms, 1234);
    }

    #[test]
    fn tool_progress_partial() {
        let p: ToolProgress = parse(r#"{"id":"call_5"}"#);
        assert_eq!(p.phase, None);
        assert_eq!(p.chunk, "");
        assert_eq!(p.elapsed_ms, 0);
    }

    #[test]
    fn tool_result_full_shape() {
        let r: ToolResult = parse(
            r#"{
                "id":"call_6",
                "ok":true,
                "status":"completed",
                "name":"code_interpreter",
                "output":"3",
                "stderr":"",
                "errorCode":"execution_timeout",
                "retryable":false,
                "userMessage":"执行超时",
                "detail":{"phase":"completed"},
                "artifacts":[{"name":"plot.png","mimeType":"image/png"}],
                "executionId":"ex_1",
                "durationMs":1500,
                "visualization":{"template":"chart","title":"t"},
                "plan":{"title":"p","steps":[{"n":1}]},
                "spec":{"title":"s","requirements":[{"r":1}]},
                "results":[{"title":"Rust","url":"https://rust-lang.org","snippet":"s","date":"2026-01-01","source":"bing","matchedQuery":"rust"}],
                "url":"https://example.com",
                "title":"Page",
                "truncated":true
            }"#,
        );
        assert!(r.ok);
        assert_eq!(r.status.as_deref(), Some("completed"));
        assert_eq!(r.error_code.as_deref(), Some("execution_timeout"));
        assert_eq!(r.user_message.as_deref(), Some("执行超时"));
        assert_eq!(r.artifacts.len(), 1);
        assert_eq!(r.artifacts[0].mime_type.as_deref(), Some("image/png"));
        assert_eq!(r.execution_id.as_deref(), Some("ex_1"));
        assert_eq!(r.duration_ms, Some(1500));
        assert_eq!(r.visualization.as_ref().unwrap().template.as_deref(), Some("chart"));
        assert_eq!(r.plan.as_ref().unwrap().steps.len(), 1);
        assert_eq!(r.spec.as_ref().unwrap().requirements.len(), 1);
        assert_eq!(r.results[0].matched_query.as_deref(), Some("rust"));
        assert_eq!(r.truncated, Some(true));
    }

    #[test]
    fn tool_result_minimal() {
        let r: ToolResult = parse(r#"{"id":"call_7","ok":false,"status":"failed"}"#);
        assert!(!r.ok);
        assert_eq!(r.output, None);
        assert!(r.artifacts.is_empty());
        assert!(r.results.is_empty());
        assert_eq!(r.duration_ms, None);
    }

    #[test]
    fn tool_result_roundtrip_preserves_camel_case() {
        let r: ToolResult = parse(
            r#"{"id":"c","ok":true,"status":"completed","executionId":"ex","durationMs":9,"artifacts":[{"name":"a","mimeType":"image/png"}],"results":[{"matchedQuery":"q"}]}"#,
        );
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains(r#""executionId":"ex""#), "{json}");
        assert!(json.contains(r#""mimeType":"image/png""#), "{json}");
        assert!(json.contains(r#""matchedQuery":"q""#), "{json}");
        assert!(json.contains(r#""durationMs":9"#), "{json}");
    }
}
