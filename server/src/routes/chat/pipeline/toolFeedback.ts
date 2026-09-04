/**
 * toolFeedback — assemble the role:'tool' message content the model sees
 * after a tool execution. Extracted verbatim from the runToolCall tail in
 * the route handler so executors and feedback formatting can evolve
 * independently. The 60 KB hard cap note applies at the caller
 * (wrapUntrustedToolResult) so the structured header always survives a
 * truncation.
 */

import { CONNECTOR_TOOL_NAMES } from '../../../services/connectorTools.js';
import type { ToolResult } from './types.js';

export function formatToolResultContent(toolName: string, result: ToolResult): string {
  if (toolName === 'code_interpreter') {
    const lines = [];
    lines.push(`[status: ${result.status || 'unknown'}]`);
    lines.push(`[exit_code: ${result.exitCode ?? 'n/a'}]`);
    lines.push(`[duration_ms: ${result.durationMs ?? 'n/a'}]`);
    const artifactList = (result.artifactFileIds || [])
      .map(a => `${a.name}${a.mimeType ? ` (${a.mimeType})` : ''}`)
      .join(', ');
    lines.push(`[artifacts: ${artifactList || 'none'}]`);
    if (result.status !== 'completed') {
      lines.push(`[error_code: ${result.errorCode || result.errorMessage || 'execution_failed'}]`);
      lines.push(`[retryable: ${result.retryable === false ? 'no' : 'yes'}]`);
      lines.push(`[error: ${result.errorMessage || result.error || result.status}]`);
      if (result.retryable === false) {
        // P_exec-retry-cap — after 3 consecutive failures the model
        // must stop re-emitting the same code and switch to prose.
        lines.push('This code failed 3 consecutive times. STOP retrying this exact code — explain the error to the user and propose a corrected approach in prose instead of executing again.');
      }
      // P_exec-remediation-preamble — the structured header
      // tells the model WHAT failed; this preamble tells it
      // the most likely fix. Without it, models tend to
      // re-emit the same code on retry, especially for the
      // common `SyntaxError: 'await' outside function` case
      // (model writes `await foo()` at top level, gets a
      // SyntaxError, retries with the same code). The
      // preamble is appended only on failure so it does
      // not bloat the success path.
      lines.push('');
      lines.push('Likely fixes by error_code:');
      lines.push('- `code_too_large` → split into multiple smaller runs.');
      lines.push('- `daily_execution_limit_reached` → tell the user the per-day cap; do not retry.');
      lines.push('- `execution_timeout` → the work exceeded the time budget. Split into smaller runs, or pre-compute in numpy/pandas instead of Python loops.');
      lines.push('- `output_limit_exceeded` → stdout/stderr hit the 64 KB cap. Save the data to a file, print a summary, describe the summary in prose.');
      lines.push('- `code_interpreter_unavailable` / `skipped` → the runner is off; do not retry. Tell the user.');
      lines.push('- `illustration_not_supported` → you tried to draw an SVG / illustration via code_interpreter. Call render_visualization with the svg_illustration template instead.');
      lines.push('- `SyntaxError: \'await\' outside function` → you wrote top-level `await`. Put the awaited statements inside `async def main():` and call `asyncio.run(main())` at the end.');
      lines.push('- `SyntaxError` (other) / `IndentationError` → re-read the source as if it were the body of `def __main__():`; fix indentation; nothing is permitted at module scope that would not be valid in `python -c`.');
      lines.push('- `NameError` → the variable was from a previous call. Recompute it in this run.');
      lines.push('- `ModuleNotFoundError` → use `import micropip; micropip.install("pkg")` at the top. NEVER use `pip install` or `subprocess` (the runner is WASM, no shell, no network).');
      lines.push('- `FileNotFoundError` → you guessed a path without reading the `[scratch]` header. Re-read the header; if the file is not listed, write it yourself in this run.');
      lines.push('- Empty PNG / "figure not found" → forgot `plt.close()` from the previous run. Add `plt.close("all")` at the top of this run.');
    }
    lines.push('--- stdout ---');
    lines.push(result.stdout || '(empty)');
    if (result.stderr) {
      const stderrLines = String(result.stderr).split(/\r?\n/);
      const tail = stderrLines.slice(-20).join('\n');
      const prefix = stderrLines.length > 20
        ? `…(${stderrLines.length - 20} earlier stderr lines truncated)\n`
        : '';
      lines.push('--- stderr (tail, last 20 lines) ---');
      lines.push(prefix + tail);
    }
    return lines.join('\n');
  }

  if (toolName === 'render_visualization') {
    if (result.status === 'completed' && result.visualization) {
      return `[status: completed]\n[visualization: ${result.visualization.template}]\n[title: ${result.visualization.title}]\nThe visual card is now rendered in the conversation. Refer to it briefly in prose and do not output a legacy viz/html/plot fence.`;
    }
    return `${result.correction || `[error] ${result.errorCode || 'visual_spec_invalid'}`}\n${result.retryable ? 'Do not fall back to Python or a legacy fenced visualization.' : 'Explain the issue concisely without using Python or a legacy fenced visualization.'}`;
  }

  if (toolName === 'create_plan' || toolName === 'create_spec') {
    const kind = toolName === 'create_plan' ? 'plan' : 'spec';
    if (result.status === 'completed') {
      return `[status: completed]\n[${kind} card rendered]\n${result.output || ''}\nThe ${kind} card is now shown in the conversation. Refer to it briefly in prose; do not paste the whole ${kind} again. Reply in the user's language.`;
    }
    return result.correction
      || `[status: failed]\n[error_code: ${result.errorCode || 'plan_spec_invalid'}]\n[retryable: ${result.retryable ? 'yes' : 'no'}]\n[field_errors: ${JSON.stringify(result.detail || [])}]`;
  }

  if (toolName === 'workspace_agent') {
    return result.status === 'completed'
      ? `[status: completed]\n[run_id: ${result.runId || 'unknown'}]\n[workspace_id: ${result.workspaceId || 'unknown'}]\n${result.output || result.stdout || '(no output)'}\nThe Codex workspace run is rendered inline. Summarize the concrete changes, tests, and artifacts in the user's language.`
      : `[status: ${result.status || 'failed'}]\n[run_id: ${result.runId || 'unknown'}]\n[error_code: ${result.errorCode || 'workspace_agent_failed'}]\n${result.error || 'The workspace agent did not complete.'}\nIf the run is awaiting approval, wait for the user decision instead of starting a duplicate run.`;
  }

  if (result.correction) {
    /* Schema + copy-ready example, already assembled by
       toolErrorFeedback for this rejection. */
    return result.correction;
  }

  if (result.status !== 'completed' && toolName === 'web_search') {
    return `[status: failed]\n[error_code: ${result.errorCode || 'web_search_failed'}]\n[retryable: ${result.retryable === false ? 'no' : 'yes'}]\n${result.detail || result.error || ''}\nThe search engines are unavailable or rate-limited. If retryable, wait a moment and retry with the same or a rephrased query; otherwise answer from your own knowledge and note that live results could not be fetched.`;
  }

  if (result.status !== 'completed' && toolName === 'web_fetch') {
    return `[status: failed]\n[error_code: ${result.errorCode || 'web_fetch_failed'}]\n[retryable: ${result.retryable === false ? 'no' : 'yes'}]\n${result.detail || result.error || ''}\nThe page could not be fetched (blocked, private IP, HTTP error, or timeout). Try a different URL, or fall back to web_search and rely on the snippets.`;
  }

  if (result.status !== 'completed' && (toolName === 'arxiv_search' || toolName === 'zotero_search' || toolName === 'notion_search_pages' || toolName === 'github_list_repos' || toolName === 'gitee_list_repos' || Object.values(CONNECTOR_TOOL_NAMES).includes(toolName as (typeof CONNECTOR_TOOL_NAMES)[keyof typeof CONNECTOR_TOOL_NAMES]))) {
    return `[status: failed]\n[error_code: ${result.errorCode || 'connector_failed'}]\n[retryable: ${result.retryable === false ? 'no' : 'yes'}]\n${result.detail || result.error || ''}\nThe external provider returned an error. Do not fabricate results — tell the user the connection or provider failed and suggest they verify it, then answer what you can.`;
  }

  return result.status === 'completed'
    ? (result.output || result.stdout || '(no output)')
    : `[error] ${result.error || result.status}`;
}
