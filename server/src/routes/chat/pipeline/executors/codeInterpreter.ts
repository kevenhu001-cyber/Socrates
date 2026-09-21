/**
 * code_interpreter executor.
 *
 * P_illustration-guard detects when the model is using the runtime for
 * SVG illustration instead of data analysis; the daily tier limit and the
 * progress streaming (P_progress) mirror the original route behaviour.
 */

import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { getDb } from '../../../../db/index.js';
import { executions } from '../../../../db/schema.js';
import { getExecutionsPerDay } from '../../../../lib/tiers.js';
import { codeInterpreter } from '../../../../services/codeInterpreter.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executeCodeInterpreter: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, sessionIdFromQuery, abortSignal, toolPolicy } = ctx;
  const tc = call;
  const { userId } = req;

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
    emitter.event('tool_result', {
      id: tc.id, ok: false, status: 'failed',
      output: '', stderr: '',
      error: 'Illustrations should use render_visualization with the svg_illustration template, not code_interpreter. Call render_visualization instead.',
      errorCode: 'illustration_not_supported',
      retryable: false,
      userMessage: '插画请使用 render_visualization 工具的 svg_illustration 模板，不要使用代码执行工具。',
      detail: 'code_interpreter is for data analysis, not illustrations. Call render_visualization with the svg_illustration template.',
      artifacts: [], executionId: null, durationMs: 0,
    });
    return {
      result: {
        status: 'failed',
        errorCode: 'illustration_not_supported',
        error: 'Illustrations should use render_visualization with the svg_illustration template, not code_interpreter. Call render_visualization instead.',
      },
      outcomeRecorded: false,
    };
  }

  const tierLimit = getExecutionsPerDay(req.user && req.user.tier);
  if (tierLimit > 0 && userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const db = getDb();
    /* P_syntax-no-quota — rows persisted as 'rejected' were rejected
       at compile time (SyntaxError family) and never ran user code,
       so they don't consume the daily execution budget. */
    const [countRow] = await db.select({
      count: sql<number>`COUNT(*)::int`,
    }).from(executions)
      .where(and(
        eq(executions.userId, userId),
        gte(executions.startedAt, today),
        ne(executions.status, 'rejected'),
      ));
    const usedToday = countRow?.count || 0;
    if (usedToday >= tierLimit) {
      emitter.event('tool_result', {
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
      });
      return {
        result: {
          status: 'failed',
          error: `daily_execution_limit_reached: ${tierLimit} executions per day`,
          errorCode: 'daily_execution_limit_reached',
        },
        outcomeRecorded: false,
      };
    }
  }

  /* P_progress — onProgress emits incremental events back to the browser
     as `event: tool_progress` SSE frames. The callback MUST be safe to
     call from a worker thread (codeInterpreter wraps it in try/catch). */
  let _emittedExecStart = false;
  const onProgress = (p: { executionId?: string | null; phase?: string | null; stream?: string | null; chunk?: string; elapsedMs?: number }) => {
    try {
      if (!_emittedExecStart && p.executionId) {
        _emittedExecStart = true;
        emitter.event('execution_start', {
          id: tc.id,
          executionId: p.executionId,
        });
      }
      emitter.event('tool_progress', {
        id: tc.id,
        phase: p.phase || null,
        stream: p.stream || null,
        chunk: p.chunk || '',
        elapsedMs: p.elapsedMs || 0,
      });
    } catch (_) { /* client closed */ }
  };

  const execResult: ToolResult = await codeInterpreter.execute({
    userId,
    sessionId: sessionIdFromQuery,
    language: args.language || 'python',
    code: args.code || '',
    signal: abortSignal,
    onProgress,
  });

  const isExecutionTimeout = execResult.status === 'timeout'
    || execResult.errorCode === 'execution_timeout';
  if (execResult.status !== 'completed') {
    /* Per-tool accounting lives in toolPolicy: the same failing tool
       steps aside after its own limit, and a success anywhere in the
       turn resets its streak. */
    toolPolicy.recordResult('code_interpreter', false, execResult.errorCode || 'execution_failed');
    execResult.retryable = isExecutionTimeout ? false : toolPolicy.remainingRetries('code_interpreter') > 0;
    if (!execResult.retryable) {
      execResult.userMessage = isExecutionTimeout
        ? '代码执行超过时间预算，请拆分步骤、减少循环规模或改用 numpy/pandas 向量化计算后重试。'
        : '代码执行连续多次失败，本次不再自动重试。';
    }
  } else {
    toolPolicy.recordResult('code_interpreter', true);
  }

  emitter.event('tool_result', {
    id: tc.id,
    ok: execResult.status === 'completed',
    status: execResult.status,
    output: execResult.stdout || '',
    stderr: execResult.stderr || '',
    error: execResult.status !== 'completed' ? (execResult.errorMessage || execResult.status) : null,
    errorCode: execResult.errorCode
      || (execResult.status === 'skipped' ? 'code_interpreter_unavailable' : 'execution_failed'),
    retryable: execResult.retryable === false ? false : true,
    userMessage: isExecutionTimeout
      ? '代码执行超过时间预算，请拆分步骤、减少循环规模或改用 numpy/pandas 向量化计算后重试。'
      : (execResult.status === 'completed' ? null : (execResult.userMessage || '代码未能完成执行。')),
    detail: execResult.stderr || execResult.errorMessage || null,
    artifacts: execResult.artifactFileIds || [],
    executionId: execResult.executionId,
    durationMs: execResult.durationMs,
  });

  return { result: execResult, outcomeRecorded: true };
};
