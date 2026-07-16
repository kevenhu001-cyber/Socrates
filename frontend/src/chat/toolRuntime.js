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
      return window.t(key) || fallback;
    }
  } catch (_) {}
  return fallback;
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
      card.classList.add('open');
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
    if (entry) entry.executionId = event.executionId;
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
      output = appendToolModule(entry.name, {}, ensureToolContainer());
      var syntheticCard = output && output.closest('.agent-tool-card');
      if (syntheticCard) syntheticCard.setAttribute('data-tcid', entry.id);
    } else {
      var card = findCard(entry.id);
      if (card) output = card.querySelector('.agent-tool-out');
    }

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
        if (/FileNotFoundError|No such file or directory/i.test(stderr)) {
          display += "\n\nHint: Python's working directory is the run scratch dir; only files the previous run wrote there (matplotlib PNGs, CSV exports, etc.) are available. To load a new file, attach it to the chat as input and have the code read from the path the attachment handler exposes, or have the previous cell write the file first.";
        } else if (/ModuleNotFoundError/i.test(stderr)) {
          display += "\n\nHint: Pyodide ships numpy, pandas, and matplotlib pre-installed. For other packages, install them in the run with `import micropip; micropip.install('pkg')`.";
        } else if (/PermissionError|IsADirectoryError|NotADirectoryError/i.test(stderr)) {
          display += '\n\nHint: the path is a directory or not writable. Use the artifact paths from the previous run, or write to a fresh filename.';
        }
      }
    } else {
      statusText = translate('tool.statusDone', 'Done');
      statusClass = 'ok';
      display = (result.output || '(no output)') + (result.stderr ? '\n[stderr]\n' + result.stderr : '') + duration;
    }

    entry.output = display;
    entry.isError = result.ok === false;
    entry.results = Array.isArray(result.results) ? result.results.slice(0, 20) : [];
    if (Array.isArray(result.artifacts)) entry.artifacts = normalizeArtifacts(result.artifacts);
    if (!output || entry._toolResultApplied) return;
    entry._toolResultApplied = true;
    var liveProgress = output.querySelector('.agent-tool-progress');
    if (liveProgress) liveProgress.remove();
    var toolName = entry.name || result.name || '';
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
    if (entry.isError && result.retryable && entry.name === 'web_search' && entry.input && entry.input.query) {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'agent-tool-retry';
      retry.textContent = '重试搜索';
      retry.addEventListener('click', function () { onSearchRetry(entry.input.query); });
      output.appendChild(retry);
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
      if (display || entry.isError) resultCard.classList.add('open');
    }
    for (var artifactIndex = 0; artifactIndex < entry.artifacts.length; artifactIndex++) {
      var artifact = entry.artifacts[artifactIndex];
      appendInlineArtifact(artifact.id, artifact.mimeType, output, artifact.name);
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

  return {
    recordToolUse: recordToolUse,
    recordToolProgress: recordToolProgress,
    recordToolCallDelta: recordToolCallDelta,
    recordExecutionStart: recordExecutionStart,
    recordToolResult: recordToolResult,
    dispose: dispose,
  };
}
