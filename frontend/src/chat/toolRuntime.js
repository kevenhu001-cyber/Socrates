/* chat/toolRuntime.js — per-message tool-call orchestration.
 *
 * Owns the stateful part of the tool lifecycle:
 *   tool_call_delta -> tool_use -> tool_progress -> tool_result
 * plus the independent code-execution EventSource. The chat message
 * controller supplies ownership and DOM callbacks; this module never
 * reaches into global chat state directly.
 */

import {
  appendInlineArtifact,
  appendToolModule,
  renderToolTextOutput,
  renderWebSearchResults,
  updateToolCardCode,
} from '../ui/toolCards.js';
import { mountVisualization } from '../render/visualization.js';
import { TOOL_RUN_PHASES, isTerminalToolPhase, phaseFromProgress, summarizeToolRuns, transitionToolRun } from './toolRunState.js';

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, function (char) {
    return '\\' + char.charCodeAt(0).toString(16) + ' ';
  });
}

function translate(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var translated = window.t(key);
      // The lightweight test dictionary returns the key for unknown
      // strings. Treat that as a miss so new runtime copy stays human.
      return translated && translated !== key ? translated : fallback;
    }
  } catch (_) {}
  return fallback;
}

function activeToolLabel(entry) {
  var name = entry && entry.name;
  if (name === 'web_search' || name === 'arxiv_search' || name === 'zotero_search' || name === 'notion_search_pages') {
    return translate('tool.actionSearch', 'Searching the web');
  }
  if (name === 'code_interpreter' || name === 'Code') return translate('tool.actionAnalyze', 'Analyzing data');
  if (name === 'render_visualization') return translate('tool.actionVisual', 'Creating a visual');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.actionRead', 'Reading files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.actionWrite', 'Updating files');
  return translate('tool.actionDefault', 'Using a tool');
}

function findEntry(message, id) {
  if (!message || !Array.isArray(message.toolCalls)) return null;
  for (var i = 0; i < message.toolCalls.length; i++) {
    if (message.toolCalls[i].id === id) return message.toolCalls[i];
  }
  return null;
}

function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.slice(0, 20).map(function (artifact) {
    if (typeof artifact === 'string') return { id: artifact, mimeType: null, name: null };
    return {
      id: String((artifact && artifact.id) || ''),
      mimeType: (artifact && artifact.mimeType) || null,
      name: (artifact && artifact.name) || null,
    };
  }).filter(function (artifact) { return !!artifact.id; });
}

function getRun(entry) {
  return entry && entry._run ? entry._run : null;
}

function setRun(entry, phase, patch) {
  if (!entry) return null;
  const next = transitionToolRun(getRun(entry) || {
    id: entry.id,
    tool: entry.name,
    phase: TOOL_RUN_PHASES.preparing,
    startedAt: Date.now(),
  }, phase, patch);
  // Runtime metadata must not leak into the persisted `toolCalls` schema.
  if (!Object.prototype.hasOwnProperty.call(entry, '_run')) {
    Object.defineProperty(entry, '_run', { value: next, writable: true, configurable: true, enumerable: false });
  } else {
    entry._run = next;
  }
  return next;
}

export function createToolRuntime(options) {
  options = options || {};
  var body = options.body;
  var stillOwnsSlot = options.stillOwnsSlot || function () { return true; };
  var getMessage = options.getMessage || function () { return null; };
  var ensureToolContainer = options.ensureToolContainer || function () { return body; };
  var onToolActivity = options.onToolActivity || function () {};
  var onSearchRetry = options.onSearchRetry || function (query) {
    var retryText = '请重试搜索：' + query;
    if (typeof window !== 'undefined' && typeof window.addMessage === 'function') window.addMessage('user', retryText);
    if (typeof window !== 'undefined' && typeof window.askChatTurn === 'function') window.askChatTurn(retryText);
  };
  var requestFrame = options.requestAnimationFrame || function (callback) { return requestAnimationFrame(callback); };
  var cancelFrame = options.cancelAnimationFrame || function (id) { cancelAnimationFrame(id); };
  var EventSourceImpl = options.EventSource || (typeof EventSource !== 'undefined' ? EventSource : null);

  var disposed = false;
  var pendingDeltas = [];
  var deltaFrame = null;
  var executionConnections = new Set();

  function updateRunSummary(message) {
    if (!body || !message) return;
    var group = body.querySelector('.tool-run-group');
    if (!group) return;
    var runs = (message.toolCalls || []).map(function (entry) {
      return getRun(entry) || { phase: entry && entry.isError ? TOOL_RUN_PHASES.failed : TOOL_RUN_PHASES.succeeded };
    });
    var summary = summarizeToolRuns(runs);
    var label = group.querySelector('.tool-run-summary-label');
    var meta = group.querySelector('.tool-run-summary-meta');
    if (!label || !meta) return;
    if (summary.active) {
      group.dataset.state = 'running';
      var activeEntry = null;
      for (var i = (message.toolCalls || []).length - 1; i >= 0; i--) {
        var candidate = message.toolCalls[i];
        var run = getRun(candidate);
        if (candidate && (!run || !isTerminalToolPhase(run.phase))) { activeEntry = candidate; break; }
      }
      label.textContent = summary.active === 1
        ? activeToolLabel(activeEntry)
        : translate('tool.groupWorking', 'Working');
      meta.textContent = summary.total > 1 ? summary.active + ' of ' + summary.total + ' tools' : 'Running';
    } else if (summary.failed || summary.timed_out) {
      group.dataset.state = 'error';
      label.textContent = translate('tool.groupNeedsAttention', 'Tool needs attention');
      meta.textContent = (summary.failed + summary.timed_out) + ' of ' + summary.total + ' failed';
    } else if (summary.cancelled) {
      group.dataset.state = 'cancelled';
      label.textContent = translate('tool.groupStopped', 'Tool run stopped');
      meta.textContent = summary.total + ' tool' + (summary.total === 1 ? '' : 's');
    } else {
      group.dataset.state = 'complete';
      label.textContent = translate('tool.groupComplete', 'Used tools');
      meta.textContent = summary.total + ' tool' + (summary.total === 1 ? '' : 's');
    }
  }

  function activeMessage() {
    if (disposed || !stillOwnsSlot()) return null;
    return getMessage() || null;
  }

  function findCard(id) {
    if (!body || !id) return null;
    return body.querySelector('[data-tcid="' + cssEscape(id) + '"]');
  }

  function renderProgress(progress, skipQueuedDrain) {
    var message = activeMessage();
    if (!message || !progress || !progress.id) return;
    var entry = findEntry(message, progress.id);
    if (!entry) return;
    setRun(entry, phaseFromProgress(progress), { elapsedMs: progress.elapsedMs || 0 });
    updateRunSummary(message);
    var card = findCard(progress.id);
    if (!card) {
      entry._pendingProgress = entry._pendingProgress || [];
      entry._pendingProgress.push(progress);
      return;
    }

    if (!skipQueuedDrain && entry._pendingProgress && entry._pendingProgress.length) {
      var queued = entry._pendingProgress.splice(0);
      for (var i = 0; i < queued.length; i++) renderProgress(queued[i], true);
    }

    var out = card.querySelector('.agent-tool-out');
    if (!out) return;
    var live = out.querySelector('.agent-tool-progress');
    if (!live && progress.phase !== 'timeout_warning' && progress.phase !== 'completed' && progress.phase !== 'failed' && progress.phase !== 'queued') {
      live = document.createElement('div');
      live.className = 'agent-tool-progress';
      var outputText = out.querySelector('.agent-tool-output-text');
      if (outputText) out.insertBefore(live, outputText); else out.appendChild(live);
      live.innerHTML = '<span class="agent-tool-progress-badge"></span><pre class="agent-tool-stream"></pre>';
    }

    var badge = live && live.querySelector('.agent-tool-progress-badge');
    var stream = live && live.querySelector('.agent-tool-stream');
    var phaseLabel = '[Running]';
    if (progress.phase === 'queued') phaseLabel = '[Queued]';
    else if (progress.phase === 'ready') phaseLabel = '[Booting]';
    else if (progress.phase === 'stderr') phaseLabel = '[Stderr]';
    else if (progress.phase === 'timeout_warning') phaseLabel = '[Timeout at]';
    else if (progress.phase === 'skipped') phaseLabel = '[Skipped]';
    var elapsed = ((progress.elapsedMs || 0) / 1000).toFixed(1);
    if (badge) badge.textContent = phaseLabel + ' \u00B7 ' + elapsed + 's';
    var headerStatus = card.querySelector('.agent-tool-status');
    if (headerStatus) {
      headerStatus.className = 'agent-tool-status' + (progress.phase === 'timeout_warning' ? ' warn' : ' mute');
      headerStatus.textContent = phaseLabel.replace(/^\[|\]$/g, '') + ' ' + elapsed + 's';
    }
    if (progress.phase === 'timeout_warning' && progress.chunk) {
      if (stream) {
        stream.textContent += '\n[' + progress.chunk + ']\n';
        stream.scrollTop = stream.scrollHeight;
      }
      card.style.borderColor = 'hsl(35 80% 50%)';
      return;
    }
    if (stream && progress.chunk) {
      stream.textContent += progress.chunk;
      if (stream.textContent.length > 51200) {
        stream.textContent = '[\u2026truncated\u2026]\n' + stream.textContent.slice(-51200);
      }
      stream.scrollTop = stream.scrollHeight;
    }
  }

  function flushDeltas() {
    deltaFrame = null;
    var message = activeMessage();
    if (!message || !pendingDeltas.length) return;
    var latest = new Map();
    for (var i = 0; i < pendingDeltas.length; i++) {
      var delta = pendingDeltas[i];
      if (!delta) continue;
      latest.set((delta.id || '?') + ':' + (delta.index || 0), delta);
    }
    pendingDeltas = [];

    var matchedIds = new Set();
    var cards = body.querySelectorAll('.agent-tool-card[data-tcid]');
    for (var cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      var card = cards[cardIndex];
      var toolCallId = card.getAttribute('data-tcid');
      var found = null;
      latest.forEach(function (candidate) {
        if (!found && candidate && candidate.id === toolCallId) found = candidate;
      });
      if (!found) continue;
      matchedIds.add(found.id);
      try { updateToolCardCode(toolCallId, found.arguments || '', found.name || ''); } catch (_) {}
      if (found.final) {
        var code = card.querySelector('.agent-tool-code');
        if (code) code.classList.remove('agent-tool-code-streaming');
      }
    }

    latest.forEach(function (delta) {
      if (!delta || !delta.id || matchedIds.has(delta.id)) return;
      var entry = findEntry(message, delta.id);
      if (entry) {
        entry._pendingDeltas = entry._pendingDeltas || [];
        entry._pendingDeltas.push(delta);
        return;
      }
      if (!message._orphanDeltas || typeof message._orphanDeltas !== 'object' || Array.isArray(message._orphanDeltas)) {
        message._orphanDeltas = {};
      }
      if (!message._orphanDeltas[delta.id]) message._orphanDeltas[delta.id] = [];
      message._orphanDeltas[delta.id].push(delta);
    });
  }

  function closeConnection(connection) {
    if (!connection) return;
    clearTimeout(connection.timer);
    try { connection.source.close(); } catch (_) {}
    executionConnections.delete(connection);
  }

  function connectExecution(executionId, toolCallId) {
    if (!executionId || !toolCallId || disposed || !EventSourceImpl) return;
    try {
      var source = new EventSourceImpl('/api/executions/' + encodeURIComponent(executionId) + '/stream');
      var connection = { source: source, timer: null };
      executionConnections.add(connection);
      connection.timer = setTimeout(function () {
        if (!disposed) {
          recordToolResult({
            id: toolCallId,
            ok: false,
            status: 'failed',
            output: '',
            stderr: '',
            error: 'execution_sse_timeout: backend did not respond within 60s',
            artifacts: [],
            durationMs: 60000,
            executionId: executionId,
            name: 'code_interpreter',
          });
        }
        closeConnection(connection);
      }, 60000);
      source.addEventListener('progress', function (event) {
        try {
          var data = JSON.parse(event.data);
          data.id = toolCallId;
          renderProgress(data);
        } catch (_) {}
      });
      source.addEventListener('result', function (event) {
        try {
          var data = JSON.parse(event.data);
          recordToolResult({
            id: toolCallId,
            ok: data.status === 'completed',
            status: data.status,
            output: data.stdout || '(no output)',
            stderr: data.stderr || '',
            error: data.status !== 'completed' ? (data.errorMessage || data.status) : null,
            artifacts: data.artifactFileIds || [],
            durationMs: data.durationMs || 0,
            executionId: executionId,
            name: 'code_interpreter',
          });
        } catch (_) {}
        closeConnection(connection);
      });
      source.addEventListener('error', function (event) {
        try {
          var data = event.data ? JSON.parse(event.data) : null;
          if (data && data.error) {
            recordToolResult({ id: toolCallId, ok: false, status: 'failed', output: '', error: data.error, artifacts: [] });
          }
        } catch (_) {}
        closeConnection(connection);
      });
    } catch (_) {
      console.log('[execution-sse] failed');
    }
  }

  function recordToolUse(call) {
    var message = activeMessage();
    if (!message || !call || !call.name) return null;
    onToolActivity();
    var entry = {
      id: String(call.id || ('tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))),
      name: String(call.name),
      input: call.input == null ? null : call.input,
      output: null,
      isError: false,
      artifacts: [],
    };
    setRun(entry, TOOL_RUN_PHASES.preparing);

    if (pendingDeltas.length) {
      var kept = [];
      for (var i = 0; i < pendingDeltas.length; i++) {
        var delta = pendingDeltas[i];
        if (delta && delta.id === entry.id) {
          entry._pendingDeltas = entry._pendingDeltas || [];
          entry._pendingDeltas.push(delta);
        } else {
          kept.push(delta);
        }
      }
      pendingDeltas = kept;
      if (entry._pendingDeltas && entry._pendingDeltas.length) {
        var latest = entry._pendingDeltas[entry._pendingDeltas.length - 1];
        if (latest && latest.arguments) {
          if (!entry.input || typeof entry.input !== 'object') entry.input = {};
          if (!entry.input.__raw) entry.input.__raw = latest.arguments;
        }
      }
    }

    if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
    message.toolCalls.push(entry);
    var output = appendToolModule(entry.name, entry.input || {}, ensureToolContainer());
    if (!output) return null;
    var card = output.closest('.agent-tool-card');
    if (card) card.setAttribute('data-tcid', entry.id);

    var orphanDeltas = message._orphanDeltas && message._orphanDeltas[entry.id];
    if (orphanDeltas) delete message._orphanDeltas[entry.id];
    if (Array.isArray(orphanDeltas) && orphanDeltas.length) {
      entry._pendingDeltas = entry._pendingDeltas || [];
      entry._pendingDeltas.push.apply(entry._pendingDeltas, orphanDeltas);
    }
    if (entry._pendingDeltas && entry._pendingDeltas.length) {
      var queuedDeltas = entry._pendingDeltas.splice(0);
      for (var deltaIndex = 0; deltaIndex < queuedDeltas.length; deltaIndex++) {
        try { updateToolCardCode(entry.id, queuedDeltas[deltaIndex].arguments || '', queuedDeltas[deltaIndex].name || ''); } catch (_) {}
      }
    }
    if (entry._pendingProgress && entry._pendingProgress.length) {
      var queuedProgress = entry._pendingProgress.splice(0);
      for (var progressIndex = 0; progressIndex < queuedProgress.length; progressIndex++) renderProgress(queuedProgress[progressIndex], true);
    }
    if (call.name === 'code_interpreter' && call.executionId) {
      entry.executionId = call.executionId;
      connectExecution(call.executionId, entry.id);
    }
    updateRunSummary(message);
    return output;
  }

  function recordToolProgress(progress) {
    if (!activeMessage()) return;
    renderProgress(progress);
  }

  function recordToolCallDelta(delta) {
    if (!activeMessage() || !delta) return;
    pendingDeltas.push(delta);
    if (deltaFrame == null) deltaFrame = requestFrame(flushDeltas);
  }

  function recordExecutionStart(event) {
    var message = activeMessage();
    if (!message || !event || !event.executionId || !event.id) return;
    var entry = findEntry(message, event.id);
    if (entry) {
      entry.executionId = event.executionId;
      setRun(entry, TOOL_RUN_PHASES.running);
      updateRunSummary(message);
    }
    connectExecution(event.executionId, event.id);
  }

  function recordToolResult(result) {
    var message = activeMessage();
    if (!message || !result || !result.id) return;
    var output = null;
    var entry = findEntry(message, result.id);
    if (!entry) {
      entry = { id: String(result.id), name: result.name || 'tool', input: null, output: null, isError: false, artifacts: [] };
      if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
      message.toolCalls.push(entry);
      setRun(entry, TOOL_RUN_PHASES.preparing);
      output = appendToolModule(entry.name, {}, ensureToolContainer());
      var syntheticCard = output && output.closest('.agent-tool-card');
      if (syntheticCard) syntheticCard.setAttribute('data-tcid', entry.id);
    } else {
      var card = findCard(entry.id);
      if (card) output = card.querySelector('.agent-tool-out');
    }

    if (getRun(entry) && isTerminalToolPhase(getRun(entry).phase) && entry._toolResultApplied) return;

    if (result.executionId && !entry.executionId) {
      entry.executionId = result.executionId;
      connectExecution(result.executionId, result.id);
    }
    if (entry._pendingProgress && entry._pendingProgress.length) {
      var queuedProgress = entry._pendingProgress.splice(0);
      for (var progressIndex = 0; progressIndex < queuedProgress.length; progressIndex++) renderProgress(queuedProgress[progressIndex], true);
    }

    var statusText = '';
    var statusClass = '';
    var duration = result.durationMs != null ? ' [' + (result.durationMs / 1000).toFixed(1) + 's]' : '';
    var display = '';
    if (result.ok === false) {
      if (result.status === 'timeout') {
        statusText = translate('tool.statusTimeout', 'Timeout');
        statusClass = 'warn';
      } else {
        statusText = translate('tool.statusFailed', 'Failed');
        statusClass = 'err';
      }
      var errorMessage = result.userMessage || result.error || result.output || 'failed';
      display = errorMessage + duration;
      if ((result.name || entry.name) === 'code_interpreter') {
        var stderr = String(result.stderr || '') + String(errorMessage || '');
        /* P_pyerror-hints — when the model gets a Python exception
           back, a one-line hint about the failure mode cuts redundant
           "retry with the same broken code" attempts. Order matters:
           check the more specific patterns first so a SyntaxError that
           mentions "NameError" in its traceback doesn't get the
           wrong hint. */
        if (/SyntaxError|IndentationError/i.test(stderr)) {
          display += '\n\nHint: Python refused to parse the source — fix the syntax / indentation in the same run, no need to retry the whole flow.';
        } else if (/ModuleNotFoundError/i.test(stderr)) {
          display += "\n\nHint: Pyodide ships numpy, pandas, and matplotlib pre-installed. For other packages, install them in the run with `import micropip; micropip.install('pkg')`.";
        } else if (/FileNotFoundError|No such file or directory/i.test(stderr)) {
          display += "\n\nHint: the scratch dir is session-scoped and persists across every code call in this conversation. Each run prints a `[scratch]` header listing the files currently in /artifacts — read it before guessing a path. If the file you want really isn't there, write it yourself in the same run (e.g. decode a base64 payload, or generate the data inline) instead of asking the user to attach it.";
        } else if (/PermissionError|IsADirectoryError|NotADirectoryError/i.test(stderr)) {
          display += '\n\nHint: the path is a directory or not writable. Write to a fresh filename inside /artifacts.';
        } else if (/NameError/i.test(stderr)) {
          display += '\n\nHint: a variable / function name is not defined. Either import it (e.g. `import json`) or define it earlier in the same run. Pyodide globals DO NOT persist across separate code_interpreter calls — re-import or recompute any state you need.';
        } else if (/TypeError/i.test(stderr)) {
          display += '\n\nHint: a value was passed to an operation with the wrong type. Check the call signature (e.g. str vs int, list vs dict) before retrying.';
        } else if (/ValueError/i.test(stderr)) {
          display += '\n\nHint: the value passed to a function is the right type but out of range or the wrong shape (e.g. math.sqrt(-1), int("abc"), unpacking mismatch). Validate the input first.';
        } else if (/IndexError/i.test(stderr)) {
          display += '\n\nHint: list/sequence index is out of range. Guard with `if i < len(xs):` or use a try/except before retrying.';
        } else if (/KeyError/i.test(stderr)) {
          display += '\n\nHint: dict lookup failed. Use `.get(key, default)` or `if key in d:` before indexing.';
        } else if (/ZeroDivisionError/i.test(stderr)) {
          display += '\n\nHint: division by zero. Add a guard for the denominator or skip the case explicitly.';
        }
      }
    } else {
      statusText = translate('tool.statusDone', 'Done');
      statusClass = 'ok';
      display = (result.output || '(no output)') + (result.stderr ? '\n[stderr]\n' + result.stderr : '') + duration;
    }

    var terminalPhase = result.ok === false
      ? (result.status === 'timeout' ? TOOL_RUN_PHASES.timed_out : TOOL_RUN_PHASES.failed)
      : TOOL_RUN_PHASES.succeeded;
    setRun(entry, terminalPhase, { endedAt: Date.now(), durationMs: result.durationMs || 0 });
    entry.output = display;
    entry.isError = result.ok === false;
    entry.results = Array.isArray(result.results) ? result.results.slice(0, 20) : [];
    if (result.visualization && result.visualization.version === 1) {
      // Persist the normalized server spec in the existing JSON tool input.
      // Session restore and public share therefore use the same renderer.
      entry.input = result.visualization;
      entry.visualization = result.visualization;
    }
    if (Array.isArray(result.artifacts)) entry.artifacts = normalizeArtifacts(result.artifacts);
    /* P_artifact-summary-in-context — the model can't see the PNG the
       run produced unless we tell it explicitly in the message
       history. Without this block the next chat turn has zero
       awareness that anything was generated, and re-runs the same
       computation from scratch. Keep the summary compact: one line
       per file with name, mime type, and id. */
    if (entry.artifacts && entry.artifacts.length) {
      var artifactLines = ['[artifacts]'];
      for (var aIdx = 0; aIdx < entry.artifacts.length; aIdx++) {
        var a = entry.artifacts[aIdx];
        var aName = a.name || a.id || 'artifact';
        var aMime = a.mimeType || 'application/octet-stream';
        artifactLines.push('- ' + aName + ' (' + aMime + ', id=' + a.id + ')');
      }
      entry.output = entry.output ? entry.output + '\n\n' + artifactLines.join('\n') : artifactLines.join('\n');
    }
    updateRunSummary(message);
    if (!output || entry._toolResultApplied) return;
    entry._toolResultApplied = true;
    var liveProgress = output.querySelector('.agent-tool-progress');
    if (liveProgress) liveProgress.remove();
    var toolName = entry.name || result.name || '';
    if (toolName === 'render_visualization' && result.visualization && !entry.isError) {
      mountVisualization(result.visualization, body, { toolCallId: entry.id });
    }
    var rich = false;
    if (toolName === 'web_search' && Array.isArray(result.results) && result.results.length) {
      rich = renderWebSearchResults(output, result.results, (entry.input && entry.input.query) || result.query || '');
    }
    if (!rich) renderToolTextOutput(output, display || '', { isError: entry.isError, kind: entry.isError ? 'error' : 'output' });

    if (entry.isError && result.detail) {
      var details = document.createElement('details');
      details.className = 'agent-tool-error-detail';
      var summary = document.createElement('summary');
      summary.textContent = '查看技术详情';
      var code = document.createElement('code');
      code.textContent = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail);
      details.appendChild(summary);
      details.appendChild(code);
      output.appendChild(details);
    }
    var resultCard = output.closest('.agent-tool-card');
    if (resultCard) {
      resultCard.dataset.toolState = entry.isError ? 'error' : 'complete';
      resultCard.style.borderColor = '';
      var badge = resultCard.querySelector('.agent-tool-status');
      if (badge) {
        badge.className = 'agent-tool-status ' + statusClass;
        badge.textContent = statusText + (result.durationMs != null ? ' ' + (result.durationMs / 1000).toFixed(1) + 's' : '');
      }
    }
    for (var artifactIndex = 0; artifactIndex < entry.artifacts.length; artifactIndex++) {
      var artifact = entry.artifacts[artifactIndex];
      /* P_artifact-single-mount — image artifacts mount ONCE on the
         message body (inline, at-a-glance). The previous code mounted
         a second copy inside the tool card too, but appendInlineArtifact
         switched to document-wide dedup (one copy per fileId total),
         so the second mount would always be a no-op and just wasted
         a retry tick on the parallel requestImage path. The tool card
         still shows stdout/stderr so the user has the full transcript. */
      if (artifact.id && artifact.mimeType && artifact.mimeType.indexOf('image/') === 0) {
        appendInlineArtifact(artifact.id, artifact.mimeType, body, artifact.name);
      } else if (artifact.id) {
        /* Non-image artifacts (CSV, JSON, etc.) still mount in the
           tool card where they belong — clicking the link downloads
           them. No doc-wide dedup concern here because these don't
           carry the same visual flicker risk. */
        appendInlineArtifact(artifact.id, artifact.mimeType, output, artifact.name);
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pendingDeltas.length = 0;
    if (deltaFrame != null) {
      cancelFrame(deltaFrame);
      deltaFrame = null;
    }
    executionConnections.forEach(closeConnection);
    executionConnections.clear();
  }

  function cancel() {
    var message = stillOwnsSlot() ? getMessage() : null;
    if (message && Array.isArray(message.toolCalls)) {
      for (var i = 0; i < message.toolCalls.length; i++) {
        var entry = message.toolCalls[i];
        if (!entry || (getRun(entry) && isTerminalToolPhase(getRun(entry).phase))) continue;
        setRun(entry, TOOL_RUN_PHASES.cancelled, { endedAt: Date.now() });
        var card = findCard(entry.id);
        if (card) {
          card.dataset.toolState = 'cancelled';
          var badge = card.querySelector('.agent-tool-status');
          if (badge) { badge.className = 'agent-tool-status mute'; badge.textContent = translate('tool.statusStopped', 'Stopped'); }
        }
      }
      updateRunSummary(message);
    }
    dispose();
  }

  return {
    recordToolUse: recordToolUse,
    recordToolProgress: recordToolProgress,
    recordToolCallDelta: recordToolCallDelta,
    recordExecutionStart: recordExecutionStart,
    recordToolResult: recordToolResult,
    cancel: cancel,
    dispose: dispose,
  };
}
