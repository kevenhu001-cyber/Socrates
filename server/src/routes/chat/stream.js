// @ts-check
/**
 * POST /api/chat/stream — SSE streaming chat endpoint.
 *
 * Extracted from src/routes/chat.js in July 2026 so the 1158-line
 * route file could be split. The /sync (POST /) handler stayed in
 * chat.js; this file owns the streaming endpoint because it has
 * its own concerns (SSE lifecycle, tool-call loop, partial-content
 * survival on disconnect) that share very little with the sync path.
 *
 * Behaviour at a glance:
 *   1. prepareChatRequest() runs the shared prelude (parse → context
 *      inject → teacher-mode → extra_body sanitise → provider/key →
 *      monthly quota → multimodal transform).
 *   2. SSE headers + 12 KB prime flush + keepalive helper.
 *   3. streamChatCompletion() runs in a tool-calling loop
 *      (MAX_TOOL_ITERATIONS = 4) — code_interpreter, render_visualization,
 *      web_search.
 *   4. Each chunk is forwarded as a data: {…} SSE frame. Reasoning
 *      content goes through the thinking pill. Tool calls emit
 *      tool_use / tool_result / tool_progress / execution_start frames.
 *   5. On normal completion: [DONE] + clear streaming_text + recordUsage.
 *   6. On client disconnect: persist partial text/reasoning so a
 *      reload can resume/retry (P_streaming-survival).
 */

import { eq, and, gte, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { sessions, executions, connectorConnections, projectConnectorConnections } from '../../db/schema.js';
import { isUuid } from '../../lib/validate.js';
import { getExecutionsPerDay } from '../../lib/tiers.js';
import { streamChatCompletion } from '../../services/llm.js';
import { codeInterpreter } from '../../services/codeInterpreter.js';
import { webSearch } from '../../services/webSearch.js';
import { executeVisualization } from '../../services/visualization.js';
import { createToolRegistry } from '../../services/toolRegistry.js';
import { executeConnectorTool, CONNECTOR_TOOL_NAMES } from '../../services/connectorTools.js';
import { executeProjectConnectorTool, PROJECT_CONNECTOR_TOOL_NAMES } from '../../services/projectConnectorTools.js';
import { estimateMessageTokens, estimateTokens, recordUsage } from '../../services/usageTracker.js';
import { trackSseConnection, startSseKeepalive } from '../../lib/sse.js';
import { requireAuth } from '../../middleware/auth.js';

import {
  prepareChatRequest,
  SSE_PRIME,
} from './helpers.js';

/**
 * Register POST /stream on the supplied router.
 *
 * @param {import('express').Router} router
 */
export function registerStreamRoute(router) {
  /* P_stream-auth — the streaming route previously had no auth
   * middleware, leaving `req.userId` undefined when an unauthenticated
   * caller (or a mis-wired client) hit /stream. The downstream
   * code_interpreter tool then tried to insert into the
   * `executions` table with userId=null, which fails the
   * `user_id NOT NULL REFERENCES users(id)` constraint and surfaces
   * to the user as a confusing "Failed query: insert into executions…"
   * with no actionable error. Mount `requireAuth` here for parity
   * with the sync POST / route in chat.js — both endpoints spend
   * the user's LLM quota and write per-user rows, so both must be
   * gated identically. */
  router.post('/stream', requireAuth, async (req, res, next) => {
    try {
      const prep = await prepareChatRequest(req, res);
      if (!prep.ok) return;
      const { messages: finalMessages, provider, safeExtraBody, mode, temperature, maxTokens, reasoning_effort } = prep.payload;

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      /* Prime the stream BEFORE the upstream has anything to say.

         1. `res.flushHeaders()` forces Node to write the response status
            line + headers to the socket immediately. Without this, Express
            buffers the headers until the first body byte arrives from the
            LLM, which on a fast network can be a few hundred ms — the
            browser has painted the page but shows nothing yet, making the
            request look hung.

         2. EdgeOne CDN (~8 KB) and Safari's fetch ReadableStream (~1 KB)
            both apply a first-chunk buffer: they hold the start of the
            body until enough bytes accumulate, then switch to streaming
            mode. A short LLM answer fits entirely inside that buffer, so
            the client receives the whole response in one shot at the end
            — no progressive streaming, no Thinking pill.

            SSE_PRIME (12 KB of `:` comment lines) overflows both buffers
            so subsequent writes — even one-byte deltas — flow through
            immediately. Comment lines are valid per the SSE spec and
            ignored by every parser, including ours. */
      try {
        res.flushHeaders();
        res.write(SSE_PRIME);
        try { res.flush?.(); } catch {}
      } catch { /* socket already closed — the req.on('close') guard below handles it */ }

      /* P_sse-metrics — bump the active-connection counter so the
         /api/health endpoint can report how many SSE streams are open
         right now. The close handler (set below) decrements on any
         disconnect, including client aborts mid-stream. */
      trackSseConnection(req.app, +1);

      /* SSE keepalive — periodic `:keepalive` comment so the reverse proxy
         doesn't idle-kill the upstream while a reasoning model is
         thinking (60–120 s silences are common). The helper emits one
         comment immediately (so a slow first chunk doesn't look like a
         hang to nginx / EdgeOne) and self-cleans on res close/finish/
         error, so the explicit clearInterval(heartbeat) calls scattered
         through this route are no longer needed. */
      startSseKeepalive(res, { intervalMs: 10_000 });

      let fullText = '';
      let fullReasoning = '';  // P_streaming-survival
      /* Token accounting — compute prompt tokens once from the
         incoming messages, then increment completion tokens as
         chunks arrive. On done/error, persist a usage event into
         `usage_events` so the heatmap has data to draw. */
      const promptTokens = estimateMessageTokens(finalMessages);
      let completionTokens = 0;

      const abortController = new AbortController();
      let streamCompleted = false;  // P_streaming-survival — prevents close handler from overwriting cleared streaming_text
      const sessionIdFromQuery = typeof req.query.sessionId === 'string' && isUuid(req.query.sessionId)
        ? req.query.sessionId
        : null;

      req.on('close', () => {
        trackSseConnection(req.app, -1);
        if (!abortController.signal.aborted) {
          abortController.abort('client_disconnected');
        }
        // P_streaming-survival — save partial content when client
        // disconnects mid-stream so a reload can resume / retry.
        // Only save if the stream did NOT complete normally (the
        // normal completion path clears streaming_text itself).
        if (!streamCompleted && sessionIdFromQuery && (fullText || fullReasoning)) {
          const db = getDb();
          db.update(sessions)
            .set({
              streamingText: fullText || null,
              streamingReasoning: fullReasoning || null,
            })
            .where(eq(sessions.id, sessionIdFromQuery))
            .catch((err) => console.error('[chat/stream] save streaming text on close failed:', err.message));
        }
      });

      /* ─── Tool-calling loop ─────────────────────────────────────────
       * The LLM may decide mid-stream to call the code_interpreter
       * tool. We run streamChatCompletion, and on finish_reason ===
       * 'tool_calls' we:
       *   1. Emit `event: tool_use` so the client can render a card.
       *   2. Execute each tool call sequentially.
       *   3. Emit `event: tool_result` with the outcome.
       *   4. Append the tool result as a `role:'tool'` message and
       *      stream another chat completion that wraps up the answer.
       *
       * MAX_TOOL_ITERATIONS guards against the model getting stuck in
       * a tool-call loop; on overflow we emit a structured error event
       * and end the response cleanly.
       * ───────────────────────────────────────────────────────────── */
      const MAX_TOOL_ITERATIONS = 4;
      const codeInterpreterToolDef = codeInterpreter.getToolDefinition();

      // Fetch the user's connector connections so the tool registry can
      // gate connector tools on whether the user has actually connected
      // each provider.  arXiv is always enabled (public API).
      let connectorConnectionsByProvider = {};
      /** @type {Record<string, import('../../db/schema.js').projectConnectorConnections.$inferSelect | undefined>} */
      let projectConnectorConnectionsByProvider = {};
      if (req.userId) {
        try {
          const db = getDb();
          const rows = await db.select().from(connectorConnections)
            .where(eq(connectorConnections.userId, req.userId));
          for (const row of rows) {
            connectorConnectionsByProvider[row.provider] = row;
          }
          const projectRows = await db.select().from(projectConnectorConnections)
            .where(and(eq(projectConnectorConnections.userId, req.userId), eq(projectConnectorConnections.status, 'connected')));
          for (const row of projectRows) projectConnectorConnectionsByProvider[row.provider] = row;
        } catch (err) {
          console.error('[chat/stream] failed to load connector connections:', err.message);
          // Non-blocking — connector tools simply won't be available.
        }
      }
      const toolRegistry = createToolRegistry({ codeInterpreterToolDef, mode, connectorConnectionsByProvider, projectConnectorConnectionsByProvider });
      const toolDefs = toolRegistry.definitions;
      // P_tutor-no-search — Tutor mode (the guided Socratic teacher)
      // does not need web search. Its answers are rooted in the
      // built-in knowledge map, not live results. Disabling web search
      // in tutor mode prevents unnecessary tool calls that slow down
      // the conversation and confuse the teaching flow.
      let workingMessages = finalMessages;
      let visualizationValidationFailures = 0;

      const writeSse = (payload) => {
        if (abortController.signal.aborted) return;
        try { res.write(payload); try { res.flush?.(); } catch {} } catch { /* socket closed — abortController handles cleanup */ }
      };
      const safeParseJson = (s) => {
        try { return JSON.parse(s); } catch { return null; }
      };

      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        let iterFinishReason = null;
        const toolCallsThisTurn = [];

        let upstreamErr = null;
        await streamChatCompletion(
          {
            apiBase: provider.url,
            apiKey: provider.keyPlaintext,
            model: provider.model,
            messages: workingMessages,
            maxTokens,
            temperature,
            signal: abortController.signal,
            reasoning_effort,
            extra_body: safeExtraBody,
            ...(toolDefs.length > 0 ? { tools: toolDefs, tool_choice: 'auto' } : {}),
          },
          // onChunk
          (chunk) => {
            fullText += chunk;
            completionTokens = estimateTokens(fullText);
            try {
              res.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(chunk)}}}]}\n\n`);
              try { res.flush?.(); } catch {}
            } catch { /* client disconnected */ }
          },
          // onDone — capture finish_reason so the loop can dispatch
          ({ finishReason }) => {
            iterFinishReason = finishReason;
          },
          // onError
          (err) => {
            upstreamErr = err;
            console.error('[chat/stream] LLM error:', err.message);
            try {
              res.write(`event: error\ndata: ${JSON.stringify({ error: err.message, message: err.message })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            } catch { /* ignore */ }
          },
          // onReasoning — emit reasoning_content as SSE delta so the
          // client renders the thinking pill. Also accumulate so
          // streaming_text captures it on disconnect.
          (reasoning) => {
            fullReasoning += reasoning;
            try {
              res.write(`data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(reasoning)}}}]}\n\n`);
              try { res.flush?.(); } catch {}
            } catch { /* client disconnected */ }
          },
          // onToolUse — accumulate tool calls for this iteration. Flush
          // happens after the stream ends so the client sees a complete
          // tool_use event even if multiple tool_calls arrive split.
          (tc) => {
            toolCallsThisTurn.push(tc);
          },
          // P_tool_stream — forward partial tool_call deltas as
          // `event: tool_call_delta` SSE frames. The chat route uses
          // this to let the frontend render the in-progress JSON
          // (typically the Python source for code_interpreter, or the
          // query string for web_search) live, instead of waiting for
          // finish_reason='tool_calls'. The frontend correlates the
          // delta to the eventual tool_use frame via the tool_call id.
          (delta) => {
            try {
              res.write(`event: tool_call_delta\ndata: ${JSON.stringify({
                index: delta.index,
                id: delta.id || null,
                name: delta.name || null,
                arguments: delta.arguments || '',
                final: !!delta.final,
              })}\n\n`);
              try { res.flush?.(); } catch {}
            } catch { /* client disconnected */ }
          },
        );

        if (upstreamErr) {
          // Error path already wrote [DONE] and ended the response.
          if (req.userId && fullText.length > 0) {
            recordUsage({
              userId: req.userId,
              model: provider.model,
              sessionId: sessionIdFromQuery,
              promptTokens,
              completionTokens: estimateTokens(fullText),
              source: 'chat',
            });
          }
          return;
        }

        // No tool call → done. Wrap up the response.
        if (iterFinishReason !== 'tool_calls' || toolCallsThisTurn.length === 0) break;

        // Emit tool_use event for the client to render cards.
        writeSse(`event: tool_use\ndata: ${JSON.stringify(
          toolCallsThisTurn.map((t) => ({
            id: t.id,
            name: t.function && t.function.name,
            input: safeParseJson(t.function && t.function.arguments) || {},
          })),
        )}\n\n`);

        // Echo the assistant's tool_calls back as a role:'assistant'
        // message — required by the OpenAI protocol so the next hop
        // can reference the tool_call_id.
        workingMessages = workingMessages.concat([{
          role: 'assistant',
          content: null,
          tool_calls: toolCallsThisTurn.map((t) => ({
            id: t.id,
            type: 'function',
            function: t.function,
          })),
        }]);

        // Abort guard — if the client disconnected during this turn's
        // LLM streaming, skip tool execution and terminate the loop.
        if (abortController.signal.aborted) break;

        // Run each tool call. Most models emit one per turn; we keep
        // the loop sequential so backpressure on the SSE channel is
        // predictable.
        for (const tc of toolCallsThisTurn) {
          let result;
          let toolName;
          try {
            const args = safeParseJson(tc.function && tc.function.arguments) || {};
            toolName = tc.function && tc.function.name;

            if (toolName === 'code_interpreter') {
              /* P_illustration-guard — detect when the model is using
                 code_interpreter for SVG illustration / drawing tasks
                 instead of data analysis. The model sometimes routes
                 "draw a squirrel" or "用 SVG 画" to code_interpreter
                 because matplotlib has plotting capabilities. Pre-empt
                 this by scanning the code for SVG-generation patterns
                 and returning a corrective error. */
              const code = (args.code || '').toLowerCase();
              const illustrationPatterns = [
                /<svg[\s>]/,              // building SVG strings
                /turtle\.(forward|backward|left|right|circle|goto)/,  // turtle graphics
                /print\(.*<svg/i,         // printing SVG from Python
                /plt\.savefig.*\.svg/i,   // saving matplotlib as SVG
                /matplotlib.*svg/i,       // matplotlib SVG output
              ];
              const isIllustrationAttempt = illustrationPatterns.some(p => p.test(code));
              if (isIllustrationAttempt) {
                writeSse(`event: tool_result\ndata: ${JSON.stringify({
                  id: tc.id, ok: false, status: 'failed',
                  output: '', stderr: '',
                  error: 'Illustrations should use render_visualization with the svg_illustration template, not code_interpreter. Call render_visualization instead.',
                  errorCode: 'illustration_not_supported',
                  retryable: false,
                  userMessage: '插画请使用 render_visualization 工具的 svg_illustration 模板，不要使用代码执行工具。',
                  detail: 'code_interpreter is for data analysis, not illustrations. Call render_visualization with the svg_illustration template.',
                  artifacts: [], executionId: null, durationMs: 0,
                })}\n\n`);
                result = { status: 'failed', error: 'illustration_not_supported' };
                workingMessages = workingMessages.concat([{
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: '[error] illustration_not_supported: Illustrations must use render_visualization with the svg_illustration template, not code_interpreter. Call render_visualization.',
                }]);
                continue;
              }

              const tierLimit = getExecutionsPerDay(req.user && req.user.tier);
              if (tierLimit > 0 && req.userId) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const db = getDb();
                const [countRow] = await db.select({
                  count: sql`COUNT(*)::int`,
                }).from(executions)
                  .where(and(
                    eq(executions.userId, req.userId),
                    gte(executions.startedAt, today),
                  ));
                const usedToday = countRow?.count || 0;
                if (usedToday >= tierLimit) {
                  writeSse(`event: tool_result\ndata: ${JSON.stringify({
                    id: tc.id, ok: false, status: 'failed',
                    output: '', stderr: '',
                    error: `daily_execution_limit_reached: ${tierLimit} executions per day`,
                    errorCode: 'daily_execution_limit_reached',
                    retryable: false,
                    userMessage: `今日代码执行次数已达上限（${tierLimit} 次）。`,
                    detail: `daily_execution_limit_reached: ${tierLimit} executions per day`,
                    artifacts: [],
                    executionId: null,
                    durationMs: 0,
                  })}\n\n`);
                  result = { status: 'failed', error: 'daily_execution_limit_reached' };
                  workingMessages = workingMessages.concat([{
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: `[error] daily execution limit of ${tierLimit} reached. The user needs to wait until tomorrow or upgrade their plan.`,
                  }]);
                  continue;
                }
              }

              /* P_progress — onProgress emits incremental events
                 back to the browser as `event: tool_progress` SSE
                 frames. The frontend routes them to the matching
                 .agent-tool-card so the user sees a live spinner +
                 streaming stdout while the Python code is running.
                 The callback MUST be safe to call from a worker
                 thread (codeInterpreter wraps it in try/catch). */
              let _emittedExecStart = false;
              const onProgress = (p) => {
                try {
                  if (!_emittedExecStart && p.executionId) {
                    _emittedExecStart = true;
                    writeSse(`event: execution_start\ndata: ${JSON.stringify({
                      id: tc.id,
                      executionId: p.executionId,
                    })}\n\n`);
                  }
                  writeSse(`event: tool_progress
data: ${JSON.stringify({
                    id: tc.id,
                    phase: p.phase || null,
                    stream: p.stream || null,
                    chunk: p.chunk || '',
                    elapsedMs: p.elapsedMs || 0,
                  })}

`);
                } catch (_) { /* client closed */ }
              };
              const execResult = await codeInterpreter.execute({
                userId: req.userId,
                sessionId: sessionIdFromQuery,
                language: args.language || 'python',
                code: args.code || '',
                signal: abortController.signal,
                onProgress,
              });
              result = execResult;

              writeSse(`event: tool_result\ndata: ${JSON.stringify({
                id: tc.id,
                ok: execResult.status === 'completed',
                status: execResult.status,
                output: execResult.stdout || '',
                stderr: execResult.stderr || '',
                error: execResult.status !== 'completed' ? (execResult.errorMessage || execResult.status) : null,
                errorCode: execResult.status === 'timeout'
                  ? 'execution_timeout'
                  : (execResult.errorMessage || (execResult.status === 'skipped' ? 'code_interpreter_unavailable' : 'execution_failed')),
                retryable: false,
                userMessage: execResult.status === 'timeout'
                  ? '代码执行超时，请缩小计算规模后重试。'
                  : (execResult.status === 'completed' ? null : '代码未能完成执行。'),
                detail: execResult.stderr || execResult.errorMessage || null,
                artifacts: execResult.artifactFileIds || [],
                executionId: execResult.executionId,
                durationMs: execResult.durationMs,
              })}\n\n`);
            } else if (toolName === 'render_visualization') {
              result = executeVisualization(args);
              if (result.status !== 'completed') {
                visualizationValidationFailures += 1;
                result.retryable = visualizationValidationFailures <= 2;
                if (!result.retryable) {
                  result.userMessage = '可视化规格连续三次无效，本次不再自动重试。';
                }
              }
              writeSse(`event: tool_result\ndata: ${JSON.stringify({
                id: tc.id,
                name: 'render_visualization',
                ok: result.status === 'completed',
                status: result.status,
                output: result.output || '',
                visualization: result.visualization || null,
                error: result.errorCode || null,
                errorCode: result.errorCode || null,
                retryable: result.retryable,
                userMessage: result.userMessage,
                detail: result.detail,
                durationMs: result.durationMs,
              })}\n\n`);
              console.info('[visualization]', JSON.stringify({
                template: result.visualization && result.visualization.template || null,
                status: result.status,
                durationMs: result.durationMs,
                corrected: visualizationValidationFailures > 0,
              }));
            } else if (toolName === 'web_search') {
              // Execute web search as an LLM tool.
              const searchQuery = args.query || '';
              const searchCount = Math.min(args.count || 10, 12);
              let searchResults = null;
              let searchError = null;
              // Searches are idempotent and provider/network failures are often
              // transient. Retry once here; code execution deliberately does
              // not use this path because repeating it may have side effects.
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  searchResults = await webSearch(searchQuery, searchCount, {
                    userId: req.userId,
                    locale: (req.headers['accept-language'] || '').split(',')[0].trim() || null,
                  });
                  searchError = null;
                  break;
                } catch (err) {
                  searchError = err;
                  if (attempt === 0 && err && err.retryable !== false) continue;
                }
              }
              if (searchError) {
                const detail = searchError.diagnostics || String(searchError && searchError.message || searchError);
                result = {
                  status: 'failed',
                  error: searchError.code || String(searchError && searchError.message || searchError),
                  errorCode: searchError.code || 'web_search_failed',
                  retryable: searchError.retryable !== false,
                  userMessage: '暂时无法连接搜索服务，请稍后重试。',
                  detail,
                };
                writeSse(`event: tool_result\ndata: ${JSON.stringify({
                  id: tc.id, ok: false, status: 'failed', output: '', results: [],
                  error: result.error, errorCode: result.errorCode,
                  retryable: result.retryable, userMessage: result.userMessage, detail,
                })}\n\n`);
              } else if (searchResults && searchResults.length > 0) {
                /* P_search-numbered — results are formatted as a numbered
                   list with [1], [2], … markers that match the system
                   prompt's citation convention. Each block carries the
                   date and source engine when available, and a trailing
                   "Sources:" hint tells the model exactly how to format
                   the citation list in its reply. Titles / snippets are
                   length-capped so a single oversized result can't blow
                   the SSE frame. */
                const blocks = searchResults.map((r, i) => {
                  const idx = i + 1;
                  const title = String(r.title || '').slice(0, 240);
                  const url = String(r.url || '');
                  const snippet = String(r.snippet || '').slice(0, 400);
                  const date = r.date ? `    Date: ${String(r.date).slice(0, 30)}\n` : '';
                  const source = r.source ? `    Source: ${r.source}\n` : '';
                  return `[${idx}] ${title}\n    URL: ${url}\n${date}${source}    Snippet: ${snippet}`;
                });
                const footer = '\n\nCite these as [1], [2] in your reply and end with:\n  Sources:\n  [1] Title (URL)\n  [2] Title (URL)';
                const output = blocks.join('\n\n') + footer;
                result = { status: 'completed', output, results: searchResults, retryable: false };
                writeSse(`event: tool_result\ndata: ${JSON.stringify({
                  id: tc.id, ok: true, status: 'completed',
                  output,
                  retryable: false,
                  results: searchResults.map((r) => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.snippet,
                    date: r.date,
                    source: r.source || null,
                    matchedQuery: r.matchedQuery || searchQuery,
                  })),
                })}\n\n`);
              } else {
                result = {
                  status: 'completed',
                  output: 'No search results found. Try a shorter, more specific query, or wait a few minutes if you just queried the same topic.',
                  results: [], retryable: false,
                };
                writeSse(`event: tool_result\ndata: ${JSON.stringify({
                  id: tc.id, ok: true, status: 'completed',
                  output: result.output, results: [], retryable: false,
                })}\n\n`);
              }
            } else if (Object.values(PROJECT_CONNECTOR_TOOL_NAMES).includes(toolName)) {
              const PROJECT_TOOL_TO_PROVIDER = {
                [PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY]:             projectConnectorConnectionsByProvider.github,
                [PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH]:                projectConnectorConnectionsByProvider.gmail,
                [PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS]: projectConnectorConnectionsByProvider.googlecalendar,
                [PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS]:          projectConnectorConnectionsByProvider.todoist,
                [PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY]:             projectConnectorConnectionsByProvider.gitlab,
                [PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH]:              projectConnectorConnectionsByProvider.qq_mail,
              };
              const projectToolResult = await executeProjectConnectorTool(toolName, args, req.userId, PROJECT_TOOL_TO_PROVIDER[toolName]);
              const ok = projectToolResult.status === 'completed';
              writeSse(`event: tool_result\ndata: ${JSON.stringify({ id: tc.id, ok, status: projectToolResult.status, output: projectToolResult.output || '', error: projectToolResult.error || null, errorCode: projectToolResult.errorCode || null, retryable: false, userMessage: projectToolResult.userMessage || null })}\n\n`);
              result = projectToolResult;
            } else if (Object.values(CONNECTOR_TOOL_NAMES).includes(toolName)) {
              // Connector tools — execute via the shared connectorTools executor.
              const TOOL_TO_PROVIDER = {
                [CONNECTOR_TOOL_NAMES.ZOTERO]: 'zotero',
                [CONNECTOR_TOOL_NAMES.NOTION]: 'notion',
                [CONNECTOR_TOOL_NAMES.GITHUB]: 'github',
                [CONNECTOR_TOOL_NAMES.GITEE]: 'gitee',
              };
              const provider = TOOL_TO_PROVIDER[toolName];
              const connection = provider ? (connectorConnectionsByProvider?.[provider] || null) : null;
              const toolResult = await executeConnectorTool(toolName, args, connection);
              const ok = toolResult.status === 'completed';
              writeSse(`event: tool_result\ndata: ${JSON.stringify({
                id: tc.id, ok, status: toolResult.status,
                output: toolResult.output || '',
                error: toolResult.error || null,
                errorCode: toolResult.errorCode || null,
                retryable: false,
                userMessage: ok ? null : (toolResult.userMessage || '该工具暂不可用。'),
                detail: toolResult.error || null,
              })}\n\n`);
              result = toolResult;
            } else {
              // Unknown tool — tell the model so it can recover instead of looping.
              writeSse(`event: tool_result\ndata: ${JSON.stringify({
                id: tc.id, ok: false, status: 'failed',
                output: '', stderr: '', artifacts: [],
                error: 'unknown_tool',
                errorCode: 'unknown_tool', retryable: false,
                userMessage: '该工具暂不可用。', detail: 'unknown_tool',
              })}\n\n`);
              result = { status: 'failed', error: 'unknown_tool' };
            }
          } catch (err) {
            // Tool execution itself threw — never let this bubble out
            // and crash the SSE stream. Tell the model so it can pivot.
            const msg = String(err && err.message || err);
            writeSse(`event: tool_result\ndata: ${JSON.stringify({
              id: tc.id, ok: false, status: 'failed',
              output: '', stderr: '', artifacts: [],
              error: msg,
              errorCode: 'tool_execution_failed', retryable: false,
              userMessage: '工具执行失败。', detail: msg,
            })}\n\n`);
            result = { status: 'failed', error: msg };
          }

          // Feed the tool result back as role:'tool' so the next chat
          // completion sees it and can wrap up in prose.
          // P_tool-result-structured — for code_interpreter, the LLM gets
          // a structured summary (status, exit_code, duration, artifact
          // list) so it can summarize / retry / pivot without parsing raw
          // stdout. For other tools, fall back to the simple output/error
          // text. The 60 KB hard cap is applied AFTER the metadata block
          // so the structured header always survives a truncation.
          let toolContent;
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
              lines.push('- `SyntaxError: \'await\' outside function` → you wrote top-level `await`. Wrap in `def main(): await ...` and call `asyncio.run(main())` at the end.');
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
            toolContent = lines.join('\n');
          } else if (toolName === 'render_visualization') {
            if (result.status === 'completed' && result.visualization) {
              toolContent = `[status: completed]\n[visualization: ${result.visualization.template}]\n[title: ${result.visualization.title}]\nThe visual card is now rendered in the conversation. Refer to it briefly in prose and do not output a legacy viz/html/plot fence.`;
            } else {
              toolContent = `[status: failed]\n[error_code: ${result.errorCode || 'visual_spec_invalid'}]\n[retryable: ${result.retryable ? 'yes' : 'no'}]\n[field_errors: ${JSON.stringify(result.detail || [])}]\n${result.retryable ? 'Correct the visual specification and call render_visualization once more. Do not fall back to Python or legacy fenced visualization.' : 'Explain the issue concisely without using Python or a legacy fenced visualization.'}`;
            }
          } else {
            toolContent = result.status === 'completed'
              ? (result.output || result.stdout || '(no output)')
              : `[error] ${result.error || result.status}`;
          }
          workingMessages = workingMessages.concat([{
            role: 'tool',
            tool_call_id: tc.id,
            content: toolContent.slice(0, 60_000),  /* hard cap so a runaway tool result can't blow context */
          }]);
        }
      }

      /* Abort guard — if the client disconnected during tool execution,
       * skip the finalisation (writing [DONE] to a closed socket would
       * throw, and the recordUsage below would charge for an incomplete
       * response). The req.on('close') handler already stopped the
       * upstream LLM call; we just need to avoid touching the response
       * object. */
      if (abortController.signal.aborted) {
        /* Still record partial usage so the operator can see incomplete
         * responses in the heatmap and diagnose client-drop patterns. */
        if (req.userId && fullText.length > 0) {
          recordUsage({
            userId: req.userId,
            model: provider.model,
            sessionId: sessionIdFromQuery,
            promptTokens,
            completionTokens: estimateTokens(fullText),
            source: 'chat',
          });
        }
        return;
      }

      /* Done — record usage, clear streaming text, and close the stream.
       * The streaming_text is cleared so the client knows the stream
       * completed normally (no partial content to recover). The client's
       * own saveCurrentSession() will persist the full message. */
      try {
        res.write('data: [DONE]\n\n');
        res.end();
      } catch { /* ignore */ }
      if (req.userId) {
        recordUsage({
          userId: req.userId,
          model: provider.model,
          sessionId: sessionIdFromQuery,
          promptTokens,
          completionTokens,
          source: 'chat',
        });
      }
      // P_streaming-survival — mark stream as completed BEFORE clearing
      // streaming_text, so the close handler doesn't overwrite with stale data.
      streamCompleted = true;
      // P_streaming-survival — clear streaming_text on normal completion
      // so the client knows no partial content needs recovery.
      if (sessionIdFromQuery) {
        const db = getDb();
        db.update(sessions)
          .set({ streamingText: null, streamingReasoning: null })
          .where(eq(sessions.id, sessionIdFromQuery))
          .catch(() => {});
      }
    } catch (err) { next(err); }
  });
}
