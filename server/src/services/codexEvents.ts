/**
 * Stable translation from Codex app-server notifications to the small event
 * vocabulary used by Socrates' Agent Runtime. Keeping this mapping outside
 * the legacy /api/codex route means Chat, Tutor, scheduled jobs, and the
 * compatibility API all observe the same execution semantics.
 */

export interface MappedCodexEvent {
  event: string;
  data: Record<string, unknown>;
}

export function mapCodexNotification(
  method: string,
  params: Record<string, any>,
  rpcId?: number | string,
): MappedCodexEvent | null {
  switch (method) {
    case 'turn/started':
      return { event: 'turn_started', data: { turnId: params.turn?.id ?? params.turnId, status: params.turn?.status } };
    case 'thread/status/changed':
      return { event: 'thread_status', data: { threadId: params.threadId, status: params.status } };
    case 'item/agentMessage/delta':
      return { event: 'delta', data: { itemId: params.itemId, delta: params.delta ?? '' } };
    case 'item/reasoning/textDelta':
    case 'item/reasoning/summaryTextDelta':
      return { event: 'reasoning', data: { itemId: params.itemId, delta: params.delta ?? '' } };
    case 'item/commandExecution/outputDelta':
    case 'item/fileChange/outputDelta':
      return { event: 'tool_output', data: { itemId: params.itemId, delta: params.delta ?? '' } };
    case 'item/started': {
      const item = params.item || {};
      switch (item.type) {
        case 'commandExecution':
          return { event: 'tool', data: { itemId: item.id, type: item.type, command: item.command, cwd: item.cwd, status: item.status } };
        case 'fileChange':
          return { event: 'tool', data: { itemId: item.id, type: item.type, changes: item.changes, status: item.status } };
        case 'mcpToolCall':
          return { event: 'tool', data: { itemId: item.id, type: item.type, name: item.name, server: item.server ?? null, tool: item.tool ?? null, status: item.status } };
        case 'webSearch':
          return { event: 'tool', data: { itemId: item.id, type: item.type, query: item.query, status: item.status } };
        case 'agentMessage':
          return { event: 'item_started', data: { itemId: item.id, type: item.type, phase: item.phase } };
        case 'reasoning':
          return { event: 'item_started', data: { itemId: item.id, type: item.type, summary: item.summary } };
        default:
          return { event: 'item_started', data: { itemId: item.id, type: item.type } };
      }
    }
    case 'item/completed': {
      const item = params.item || {};
      return {
        event: 'item_completed',
        data: {
          itemId: item.id,
          type: item.type,
          status: item.status,
          text: item.text ?? null,
          changes: item.changes ?? null,
          /* Command/tool metadata the step UI needs: the command that ran,
             how it ended, and how long it took. Absent for item types that
             do not carry them. */
          command: item.command ?? null,
          cwd: item.cwd ?? null,
          exitCode: item.exitCode ?? null,
          durationMs: item.durationMs ?? null,
          aggregatedOutput: item.aggregatedOutput ?? null,
          server: item.server ?? null,
          tool: item.tool ?? null,
          query: item.query ?? null,
        },
      };
    }
    /* Codex reports the model's own todo list for the turn. It is the same
       information the Codex UI shows as a checklist, so Socrates surfaces it
       as a plan card that updates in place. */
    case 'turn/plan/updated':
      return {
        event: 'plan',
        data: {
          threadId: params.threadId,
          turnId: params.turnId,
          plan: Array.isArray(params.plan) ? params.plan : [],
          explanation: params.explanation ?? null,
        },
      };
    case 'item/commandExecution/requestApproval':
      return {
        event: 'approval_required',
        data: {
          requestId: rpcId ?? params.itemId ?? params.requestId,
          kind: 'commandExecution',
          itemId: params.itemId,
          threadId: params.threadId,
          turnId: params.turnId,
          reason: params.reason ?? null,
          command: params.command ?? null,
          cwd: params.cwd ?? null,
          environmentId: params.environmentId ?? null,
          availableDecisions: params.availableDecisions ?? ['accept', 'decline'],
        },
      };
    case 'item/fileChange/requestApproval':
      return {
        event: 'approval_required',
        data: {
          requestId: rpcId ?? params.itemId ?? params.requestId,
          kind: 'fileChange',
          itemId: params.itemId,
          threadId: params.threadId,
          turnId: params.turnId,
          reason: params.reason ?? null,
          changes: params.changes ?? null,
          availableDecisions: params.availableDecisions ?? ['accept', 'decline'],
        },
      };
    case 'thread/tokenUsage/updated':
      return { event: 'usage', data: { threadId: params.threadId, usage: params.usage ?? params.tokenUsage ?? null } };
    case 'turn/completed': {
      const turn = params.turn ?? {};
      return { event: 'turn_completed', data: { turnId: params.turnId ?? turn.id, status: turn.status, error: turn.error ?? null } };
    }
    default:
      return null;
  }
}

