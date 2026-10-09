import { TOOL_RUN_PHASES } from '../toolRunState.js';

export interface ToolResultInput {
  id: string;
  ok?: boolean;
  status?: string;
  output?: string;
  stderr?: string;
  error?: string | null;
  errorCode?: string | null;
  userMessage?: string;
  artifacts?: Array<unknown>;
  durationMs?: number;
  name?: string;
  results?: unknown[];
  visualization?: { version: number; [key: string]: unknown } | null;
  detail?: unknown;
  retryable?: boolean;
  executionId?: string;
  query?: string;
}

interface ArtifactSummary {
  id: string;
  mimeType: string | null;
  name: string | null;
}

type SummaryToolState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

export interface ToolResultProjection {
  awaitingApproval: boolean;
  runPhase: string;
  activityState: SummaryToolState;
  entryPatch: Record<string, unknown>;
}

function normalizeArtifacts(artifacts: unknown): ArtifactSummary[] {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.slice(0, 20).map(function (artifact: unknown) {
    if (typeof artifact === 'string') return { id: artifact, mimeType: null, name: null };
    const value = artifact as { id?: string; mimeType?: string; name?: string } | null;
    return {
      id: String((value && value.id) || ''),
      mimeType: (value && value.mimeType) || null,
      name: (value && value.name) || null,
    };
  }).filter(function (artifact) { return !!artifact.id; });
}

const PYTHON_ERROR_HINTS = [
  { pattern: /SyntaxError|IndentationError/i, hint: 'Python refused to parse the source — fix the syntax / indentation in the same run, no need to retry the whole flow.' },
  { pattern: /ModuleNotFoundError/i, hint: "packages in the Pyodide distribution (scipy, sympy, scikit-learn, networkx, pillow…) auto-install on `import` — just import them. For a PyPI-only wheel use `import micropip, asyncio; asyncio.run(micropip.install('pkg'))` in the same run." },
  { pattern: /FileNotFoundError|No such file or directory/i, hint: 'the scratch dir is session-scoped and persists across every code call in this conversation. Each run prints a `[scratch]` header listing the files currently in /artifacts — read it before guessing a path.' },
  { pattern: /PermissionError|IsADirectoryError|NotADirectoryError/i, hint: 'the path is a directory or not writable. Write to a fresh filename inside /artifacts.' },
  { pattern: /NameError/i, hint: 'a variable / function name is not defined. Either import it or define it earlier in the same run.' },
  { pattern: /TypeError/i, hint: 'a value was passed to an operation with the wrong type. Check the call signature before retrying.' },
  { pattern: /ValueError/i, hint: 'the value passed to a function is the right type but out of range or the wrong shape.' },
  { pattern: /IndexError/i, hint: 'list/sequence index is out of range. Guard with `if i < len(xs):` or use a try/except.' },
  { pattern: /KeyError/i, hint: 'dict lookup failed. Use `.get(key, default)` or `if key in d:` before indexing.' },
  { pattern: /ZeroDivisionError/i, hint: 'division by zero. Add a guard for the denominator.' },
] as const;

function pythonErrorHint(stderr: string): string {
  const matched = PYTHON_ERROR_HINTS.find(({ pattern }) => pattern.test(stderr));
  return matched ? '\n\nHint: ' + matched.hint : '';
}

function formatDisplay(
  result: ToolResultInput,
  entryName: string,
  translate: (key: string, fallback: string) => string,
): string {
  const duration = result.durationMs != null && result.durationMs > 0
    ? ' [' + (result.durationMs / 1000).toFixed(1) + 's]'
    : '';
  if (result.status === 'awaiting_approval') {
    return translate('tool.codexApprovalCopy', 'Review the action before it continues.');
  }
  if (result.ok === false) {
    const errorMessage = result.userMessage || result.error || result.errorCode || result.output || 'failed';
    const hint = (result.name || entryName) === 'code_interpreter'
      ? pythonErrorHint(String(result.stderr || '') + String(result.error || ''))
      : '';
    return errorMessage + duration + hint;
  }
  return (result.output || '(no output)') + (result.stderr ? '\n[stderr]\n' + result.stderr : '') + duration;
}

function runPhaseForResult(result: ToolResultInput, awaitingApproval: boolean): string {
  if (awaitingApproval) return TOOL_RUN_PHASES.running;
  if (result.ok !== false) return TOOL_RUN_PHASES.succeeded;
  if (result.status === 'timeout') return TOOL_RUN_PHASES.timed_out;
  if (result.status === 'cancelled') return TOOL_RUN_PHASES.cancelled;
  return TOOL_RUN_PHASES.failed;
}

function summaryStateForResult(result: ToolResultInput, awaitingApproval: boolean): SummaryToolState {
  if (awaitingApproval) return 'awaiting';
  if (result.ok !== false) return 'done';
  return result.status === 'cancelled' ? 'stopped' : 'error';
}

function optionalResultFields(result: ToolResultInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof result.status === 'string' && result.status) fields.status = result.status;
  if (typeof result.durationMs === 'number' && Number.isFinite(result.durationMs)) {
    fields.durationMs = Math.max(0, result.durationMs);
  }
  if (result.userMessage != null) fields.userMessage = result.userMessage;
  if (result.error != null) fields.error = result.error;
  if (result.stderr) fields.stderr = result.stderr;
  if (result.errorCode !== undefined) fields.errorCode = result.errorCode ?? null;
  if (result.detail !== undefined) fields.detail = result.detail ?? null;
  if (typeof result.retryable === 'boolean') fields.retryable = result.retryable;
  return fields;
}

function visualizationFields(result: ToolResultInput): Record<string, unknown> {
  if (!result.visualization || result.visualization.version !== 1) return {};
  return { input: result.visualization, visualization: result.visualization };
}

function appendArtifactFields(
  entryPatch: Record<string, unknown>,
  result: ToolResultInput,
  display: string,
  existingArtifacts: ArtifactSummary[],
): void {
  const artifacts = Array.isArray(result.artifacts) ? normalizeArtifacts(result.artifacts) : null;
  const summaryArtifacts = artifacts || existingArtifacts;
  if (artifacts) entryPatch.artifacts = artifacts;
  if (summaryArtifacts.length) {
    const artifactLines = ['[artifacts]'];
    for (const artifact of summaryArtifacts) {
      const name = artifact.name || artifact.id || 'artifact';
      const mimeType = artifact.mimeType || 'application/octet-stream';
      artifactLines.push('- ' + name + ' (' + mimeType + ', id=' + artifact.id + ')');
    }
    entryPatch.output = display ? display + '\n\n' + artifactLines.join('\n') : artifactLines.join('\n');
  }
}

function buildEntryPatch(
  result: ToolResultInput,
  display: string,
  existingArtifacts: ArtifactSummary[],
): Record<string, unknown> {
  const entryPatch: Record<string, unknown> = {
    output: display,
    isError: result.ok === false,
    results: Array.isArray(result.results) ? result.results.slice(0, 20) : [],
    ...optionalResultFields(result),
    ...visualizationFields(result),
  };
  appendArtifactFields(entryPatch, result, display, existingArtifacts);
  return entryPatch;
}

/** Convert a terminal SSE payload into durable tool-call fields. */
export function projectToolResult(
  result: ToolResultInput,
  entryName: string,
  translate: (key: string, fallback: string) => string,
  existingArtifacts: ArtifactSummary[] = [],
): ToolResultProjection {
  const awaitingApproval = result.status === 'awaiting_approval';
  const display = formatDisplay(result, entryName, translate);
  return {
    awaitingApproval,
    runPhase: runPhaseForResult(result, awaitingApproval),
    activityState: summaryStateForResult(result, awaitingApproval),
    entryPatch: buildEntryPatch(result, display, existingArtifacts),
  };
}
