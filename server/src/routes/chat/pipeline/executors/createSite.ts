/**
 * create_site executor.
 *
 * Stores the model-produced standalone HTML document as a `site` artifact
 * and publishes it (share token + visibility), mirroring the creations
 * routes. The returned output carries the share URL so the model can hand
 * it to the user verbatim.
 */

import { createAndPublishSite } from '../../../../services/siteCreation.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executeCreateSite: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, toolPolicy } = ctx;
  const started = Date.now();
  let result: ToolResult;

  const fail = (code: string, detail: string, userMessage = '站点创建失败。'): ToolExecutionResult => {
    /* Argument faults (missing title, non-HTML source) stay retryable so
       the model can fix the call; the turn policy decides when to stop
       inviting retries. Outcome is recorded here, so the dispatcher skips
       its generic accounting (outcomeRecorded). */
    toolPolicy.recordResult('create_site', false, code);
    const retryable = toolPolicy.remainingRetries('create_site') > 0;
    result = { status: 'failed', error: code, errorCode: code, retryable, durationMs: Date.now() - started };
    emitter.event('tool_result', {
      id: call.id, name: 'create_site', ok: false, status: 'failed', output: '',
      error: code, errorCode: code, retryable, userMessage, detail,
      durationMs: result.durationMs,
    });
    return { result, outcomeRecorded: true };
  };

  if (!req.userId) {
    return fail('unauthenticated', 'No authenticated user on this request.');
  }

  try {
    const site = await createAndPublishSite(req.userId, {
      title: args.title,
      source: args.source,
      visibility: typeof args.visibility === 'string' ? args.visibility : undefined,
      sessionId: ctx.sessionIdFromQuery,
      projectId: ctx.projectIdFromBody,
    });
    toolPolicy.recordResult('create_site', true);
    const output = JSON.stringify(site);
    result = { status: 'completed', output, durationMs: Date.now() - started };
    emitter.event('tool_result', {
      id: call.id, name: 'create_site', ok: true, status: 'completed', output,
      siteId: site.id, url: site.url, visibility: site.visibility,
      retryable: false,
      userMessage: site.url ? `站点已发布：${site.url}` : '站点已保存（私有）。',
      durationMs: result.durationMs,
    });
    console.info('[create_site]', JSON.stringify({ id: site.id, visibility: site.visibility, durationMs: result.durationMs }));
    return { result, outcomeRecorded: true };
  } catch (err) {
    const code = (err as { code?: string })?.code || 'site_create_failed';
    const message = (err as Error)?.message || String(err);
    return fail(code, message);
  }
};
