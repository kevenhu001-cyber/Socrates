/**
 * toolResultMessage — assemble the role:'tool' message content the model sees
 * after a tool execution. Extracted verbatim from the runToolCall tail in
 * the route handler so executors and feedback formatting can evolve
 * independently. The 60 KB hard cap note applies at the caller
 * (wrapUntrustedToolResult) so the structured header always survives a
 * truncation.
 */

import { CONNECTOR_TOOL_NAMES } from '../../../services/integrations/connectorTools.js';
import { isOpenConnectorActionRetryable } from '../../../services/integrations/openConnectorChatTools.js';
import type { ToolResult } from './types.js';

const CONNECTOR_TOOL_NAME_SET = new Set(Object.values(CONNECTOR_TOOL_NAMES));

export function formatToolResultContent(toolName: string, result: ToolResult): string {
  const retryable =
    result.retryable === true &&
    (!toolName.startsWith('oc_') || isOpenConnectorActionRetryable(toolName));
  if (toolName === 'code_interpreter') {
    const lines = [];
    lines.push(`[status: ${result.status || 'unknown'}]`);
    lines.push(`[exit_code: ${result.exitCode ?? 'n/a'}]`);
    lines.push(`[duration_ms: ${result.durationMs ?? 'n/a'}]`);
    const artifactList = (result.artifactFileIds || [])
      .map((a) => `${a.name}${a.mimeType ? ` (${a.mimeType})` : ''}${a.id ? ` [id:${a.id}]` : ''}`)
      .join(', ');
    lines.push(`[artifacts: ${artifactList || 'none'}]`);
    if ((result.artifactFileIds || []).some((a) => /^image\//i.test(a.mimeType || ''))) {
      lines.push('');
      lines.push(
        'Image artifacts are NOT rendered automatically. The image is optional: include it only when it materially helps the answer, using exactly `![short description](/api/files/<fileId>/raw)` with an id above. Otherwise describe the result in prose.',
      );
    }
    if (result.status !== 'completed') {
      lines.push(`[error_code: ${result.errorCode || result.errorMessage || 'execution_failed'}]`);
      lines.push(`[retryable: ${retryable ? 'yes' : 'no'}]`);
      lines.push(`[error: ${result.errorMessage || result.error || result.status}]`);
      if (!retryable) {
        lines.push(
          'This call is not retryable. STOP retrying this exact code. Do not quote internal diagnostics in your answer. Continue with a corrected approach in prose, or state the limitation in one plain sentence.',
        );
      }
      const diagnostic = [result.errorCode, result.errorMessage, result.error, result.stderr].filter(Boolean).join('\n');
      const fixes: Array<[RegExp, string]> = [
        [/code_too_large/i, 'Split into smaller runs.'],
        [/execution_queue_timeout|daily_execution_limit_reached|code_interpreter_unavailable|skipped/i, 'Execution is unavailable; do not retry this turn.'],
        [/execution_timeout/i, 'Split the work into smaller runs or use vectorized numpy/pandas operations.'],
        [/output_limit_exceeded/i, 'Save the full data to a file and print a concise summary.'],
        [/illustration_not_supported/i, 'Use render_intelligent_ui with svg_illustration when available.'],
        [/SyntaxError:.*await.*outside function/i, 'Wrap awaited statements in async def main() and call asyncio.run(main()).'],
        [/SyntaxError|IndentationError/i, 'Check Python module syntax and indentation.'],
        [/NameError/i, 'Recompute variables in this run; previous calls do not share Python state.'],
        [/python_dependency_unavailable/i, 'Use the standard library or a dependency-free approach; do not keep installing the same package.'],
        [/ModuleNotFoundError/i, 'Pyodide packages auto-load from imports; for compatible pure-Python wheels use asyncio.run(micropip.install("pkg")). No shell or pip install.'],
        [/FileNotFoundError/i, 'Use an existing path from the scratch header or create the file first.'],
        [/Empty PNG|figure not found/i, 'Close old figures and save the new figure explicitly.'],
      ];
      const fix = fixes.find(([pattern]) => pattern.test(diagnostic));
      if (fix) lines.push('Suggested fix: ' + fix[1]);
      lines.push('Treat diagnostics as internal feedback; retry safely if permitted, otherwise state only a material limitation.');
    }
    lines.push('--- stdout ---');
    lines.push(result.stdout || '(empty)');
    if (result.stderr) {
      const stderrLines = String(result.stderr).split(/\r?\n/);
      const tail = stderrLines.slice(-20).join('\n');
      const prefix =
        stderrLines.length > 20
          ? `…(${stderrLines.length - 20} earlier stderr lines truncated)\n`
          : '';
      lines.push('--- stderr (tail, last 20 lines) ---');
      lines.push(prefix + tail);
    }
    return lines.join('\n');
  }

  if (toolName === 'create_document') {
    const kind = result.plan ? 'plan' : 'spec';
    if (result.status === 'completed') {
      return `[status: completed]\n[${kind} card rendered]\n${result.output || ''}\nThe ${kind} card is now shown in the conversation. Refer to it briefly in prose; do not paste the whole ${kind} again. Reply in the user's language.`;
    }
    return (
      (retryable ? result.correction : undefined) ||
      `[status: failed]\n[error_code: ${result.errorCode || 'plan_spec_invalid'}]\n[retryable: ${result.retryable ? 'yes' : 'no'}]\n[field_errors: ${JSON.stringify(result.detail || [])}]\nKeep field errors internal; correct the call if permitted, otherwise continue in prose.`
    );
  }

  if (toolName === 'workspace_agent') {
    return result.status === 'completed'
      ? `[status: completed]\n[run_id: ${result.runId || 'unknown'}]\n[workspace_id: ${result.workspaceId || 'unknown'}]\n${result.output || result.stdout || '(no output)'}\nThe workspace run is rendered inline. Summarize the concrete changes, tests, and artifacts in the user's language.`
      : `[status: ${result.status || 'failed'}]\n[run_id: ${result.runId || 'unknown'}]\n[error_code: ${result.errorCode || 'workspace_agent_failed'}]\n${result.error || 'The workspace agent did not complete.'}\nDo not start a duplicate run; continue with a corrected task. Keep diagnostics internal; state only a material limitation.`;
  }

  if (result.correction) {
    /* Schema + copy-ready example, already assembled by
       toolCorrectionMessage for this rejection. */
    return retryable
      ? `[status: failed]\n[retryable: yes]\n${result.correction}`
      : `[status: failed]\n[retryable: no]\n[error_code: ${result.errorCode || 'tool_failed'}]\nDo not repeat this failed call. Continue with verified results or another safe approach, and mention only a material limitation.`;
  }

  if (result.status !== 'completed' && toolName === 'web_search') {
    return `[status: failed]\n[error_code: ${result.errorCode || 'web_search_failed'}]\n[retryable: ${retryable ? 'yes' : 'no'}]\n${result.detail || result.error || ''}\nThe search engines are unavailable or rate-limited. If retryable, wait a moment and retry with the same or a rephrased query; otherwise answer from your own knowledge and note that live results could not be fetched, without quoting the search error.`;
  }

  if (result.status !== 'completed' && toolName === 'web_fetch') {
    if (result.errorCode === 'offset_out_of_range') {
      return `[status: failed]\n[error_code: offset_out_of_range]\n${result.detail || ''}\nThere is no next page at that offset; use the previous next_offset or restart at offset 0.`;
    }
    if (result.errorCode === 'page_cache_miss') {
      return `[status: failed]\n[error_code: page_cache_miss]\n${result.detail || ''}\nRestart this URL at offset 0 to establish a fresh page snapshot before continuing.`;
    }
    if (result.errorCode === 'invalid_paging_arguments') {
      return '[status: failed]\n[error_code: invalid_paging_arguments]\nUse an integer offset from 0 to 1000000 and max_chars from 1 to 30000.';
    }
    return `[status: failed]\n[error_code: ${result.errorCode || 'web_fetch_failed'}]\n[retryable: ${retryable ? 'yes' : 'no'}]\n${result.detail || result.error || ''}\nThe page could not be fetched (blocked, private IP, HTTP error, or timeout). Try a different URL, or fall back to web_search and rely on the snippets.`;
  }

  if (
    result.status !== 'completed' &&
    (CONNECTOR_TOOL_NAME_SET.has(toolName) ||
      toolName.startsWith('oc_') ||
      toolName.startsWith('oomol_'))
  ) {
    const nonIdempotentOpenConnectorAction =
      toolName.startsWith('oc_') && !isOpenConnectorActionRetryable(toolName);
    const isImageSubmission = toolName === 'oc_jimeng_ai_submit_image_generation_4_6';
    const context = nonIdempotentOpenConnectorAction
      ? 'The action has an uncertain outcome. Do not claim it completed or that the provider did nothing.'
      : 'The connector could not provide results. Do not fabricate results. Do not quote internal provider diagnostics. Answer what you can and state the limitation only if it matters.';
    const nextStep = nonIdempotentOpenConnectorAction
      ? isImageSubmission
        ? 'This request may have created an image task even though its response failed. Do not submit it again automatically; state that the outcome is uncertain and ask before creating another task, without quoting the provider error.'
        : 'This action may have taken effect even though its response failed. Do not repeat it automatically; state that the outcome is uncertain and ask before repeating, without quoting the provider error.'
      : retryable
        ? 'Wait briefly and retry this read once. If it fails again, stop and state the limitation without repeating the provider error.'
        : 'Do not blindly repeat the same call. If the error points to a missing or rejected connection, ask the user to verify it; otherwise continue without this source or use another tool.';
    return `[status: failed]\n[error_code: ${result.errorCode || 'connector_failed'}]\n[retryable: ${retryable ? 'yes' : 'no'}]\n${result.detail || result.error || ''}\n${context} ${nextStep}`;
  }

  if (result.status === 'completed') return result.output || result.stdout || '(no output)';
  const detail =
    result.detail === undefined || result.detail === null
      ? ''
      : `\n[detail: ${String(result.detail).slice(0, 1200)}]`;
  return `[status: ${result.status || 'failed'}]\n[error_code: ${result.errorCode || 'tool_failed'}]\n[retryable: ${retryable ? 'yes' : 'no'}]\n[error: ${result.errorMessage || result.error || result.status || 'Tool failed.'}]${detail}\nTreat diagnostics as internal feedback; retry safely if permitted, otherwise state only a material limitation.`;
}
