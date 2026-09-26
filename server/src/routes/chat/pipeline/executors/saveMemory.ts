/**
 * save_memory executor — writes one durable user fact into the
 * `memories` table. Server-side guards the model cannot express in the
 * schema: auth, length cap, exact-text dedupe, and project ownership
 * verification for scope='project'.
 */

import {and, eq} from 'drizzle-orm';
import {getDb} from '../../../../db/index.js';
import {memories, projects} from '../../../../db/schema.js';
import type {ToolExecutionResult, ToolExecutor, ToolExecutorContext} from './types.js';
import type {ToolCall, ToolResult} from '../types.js';

const TEXT_LIMIT = 500;

function fail(ctx: ToolExecutorContext, call: ToolCall, errorCode: string, retryable: boolean, detail?: string): ToolExecutionResult {
  const result: ToolResult = { status: 'failed', error: errorCode, errorCode, retryable, detail };
  ctx.emitter.event('tool_result', {
    id: call.id, ok: false, status: 'failed', output: '',
    error: errorCode, errorCode, retryable,
    userMessage: '无法保存记忆。', detail,
  });
  return { result };
}

export const executeSaveMemory: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, projectIdFromBody } = ctx;
  const userId = req.userId;
  if (!userId) {
    return fail(ctx, call, 'auth_required', false, 'Memory writes require an authenticated user.');
  }

  const text = String(args.text || '').trim().slice(0, TEXT_LIMIT);
  if (!text) {
    return fail(ctx, call, 'missing_text', false, 'Provide a non-empty `text` string.');
  }

  const scope = args.scope === 'project' ? 'project' : 'global';
  let projectId: string | null = null;
  if (scope === 'project') {
    if (!projectIdFromBody) {
      return fail(ctx, call, 'no_active_project', false, 'scope "project" requires an active project; use "global" instead.');
    }
    /* The id is client-supplied — verify ownership before tagging a
       memory so a forged id cannot attach rows to another project. */
    try {
      const db = getDb();
      const [own] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectIdFromBody), eq(projects.userId, userId)))
        .limit(1);
      if (!own) {
        return fail(ctx, call, 'project_not_found', false, 'The active project was not found for this user.');
      }
      projectId = projectIdFromBody;
    } catch (err) {
      return fail(ctx, call, 'memory_write_failed', true, String((err as Error).message || err));
    }
  }

  try {
    const db = getDb();
    /* Exact-text dedupe: a re-save of an enabled row is a no-op; a
       re-save of a disabled row revives it instead of duplicating. */
    const [existing] = await db.select().from(memories)
      .where(and(eq(memories.userId, userId), eq(memories.text, text)))
      .limit(1);
    if (existing) {
      if (!existing.enabled) {
        await db.update(memories).set({ enabled: true }).where(eq(memories.id, existing.id));
      }
      const output = `Memory already saved (id: ${existing.id}).`;
      emitter.event('tool_result', { id: call.id, ok: true, status: 'completed', output });
      return { result: { status: 'completed', output } };
    }

    const [row] = await db.insert(memories).values({
      userId,
      text,
      scope,
      projectId,
      source: 'assistant',
    }).returning();
    const output = `Memory saved${scope === 'project' ? ' for this project' : ''} (id: ${row.id}).`;
    emitter.event('tool_result', { id: call.id, ok: true, status: 'completed', output });
    return { result: { status: 'completed', output } };
  } catch (err) {
    return fail(ctx, call, 'memory_write_failed', true, String((err as Error).message || err));
  }
};
