import type { PublicTurnActivity } from '@socrates/contracts';
import type { LegacyChatMessage, LiveTurnStatus } from '../react/types/domain';
import { toolRunStateOf } from './toolPresentationState';
import { toolRunLabel, translate } from './toolPresentationModel';

/** Validate progress at the transport boundary. No reasoning-text extraction. */
export function normalizePublicTurnActivity(value: unknown): PublicTurnActivity | null {
  if (!value || typeof value !== 'object') return null;
  const activity = value as Record<string, unknown>;
  switch (activity.type) {
    case 'thinking': case 'synthesizing': return { type: activity.type };
    case 'tool':
      return typeof activity.toolCallId === 'string' && typeof activity.toolName === 'string'
        ? { type: 'tool', toolCallId: activity.toolCallId, toolName: activity.toolName } : null;
    case 'public_reasoning_summary':
      return typeof activity.text === 'string' && activity.text.trim()
        ? { type: 'public_reasoning_summary', text: activity.text.trim().slice(0, 500) } : null;
    case 'done': return { type: 'done', durationMs: validDuration(activity.durationMs) };
    default: return null;
  }
}

function validDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

interface PresentationOptions {
  live?: boolean;
  hasRunningRow?: boolean;
  hasSettledTool?: boolean;
}

/**
 * Provider reasoning and public answer text share the same raw stream field
 * for a few legacy providers. Treat a think-only payload as non-answer text
 * so the live activity line can stay visible until the first real prose.
 */
function hasVisibleAnswerText(message: LegacyChatMessage): boolean {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  return rawText
    .replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '')
    .trim()
    .length > 0;
}

function observedStatus(message: LegacyChatMessage, activity: PublicTurnActivity): LiveTurnStatus | undefined {
  const legacy = message._liveStatus;
  switch (activity.type) {
    case 'thinking': return hasVisibleAnswerText(message) ? undefined : { phase: 'thinking', label: translate('think.analyzing', 'Analyzing the question'), elapsedSec: legacy?.elapsedSec };
    case 'public_reasoning_summary': return hasVisibleAnswerText(message) ? undefined : { phase: 'thinking', label: activity.text };
    case 'synthesizing': return hasVisibleAnswerText(message) ? undefined : { phase: 'synthesizing', label: translate('think.synthesizing', 'Preparing the answer') };
    case 'tool': {
      const call = message.toolCalls?.find((entry) => entry.id === activity.toolCallId);
      if (call && !['running', 'awaiting'].includes(toolRunStateOf(call))) return undefined;
      const label = legacy?.phase === 'tool-running' ? legacy.label : toolRunLabel({ name: activity.toolName }, 'running').text;
      return { phase: 'tool-running', toolName: activity.toolName, label };
    }
    case 'done': return undefined;
  }
}

function selectedStatus(message: LegacyChatMessage, activity: PublicTurnActivity | null, live: boolean, options: PresentationOptions): LiveTurnStatus | undefined {
  const legacy = message._liveStatus || undefined;
  if (legacy?.phase === 'error' || legacy?.phase === 'stopped') return legacy;
  if (live && legacy?.phase === 'retrying') return legacy;
  if (!live || options.hasRunningRow) return undefined;
  if (activity) return observedStatus(message, activity);
  return legacy?.phase === 'tool-running' && options.hasSettledTool ? undefined : legacy;
}

/** One owner for activity, terminal notices, cursor and toolbar visibility.
 * A mounted running tool owns activity; a deferred tool retains its status.
 * Transport completion is distinct from playback completion: a done event
 * cannot mount actions while the final text is still draining. */
export function deriveTurnPresentationState(message: LegacyChatMessage, options: PresentationOptions = {}) {
  const live = options.live ?? (message.type === 'streaming' && message._streamSettled !== true);
  const activity = normalizePublicTurnActivity(message._activity);
  const status = selectedStatus(message, activity, live, options);
  return {
    primaryActivity: activity,
    status,
    publicSummary: live && options.hasRunningRow ? '' : (message.summary?.trim() || ''),
    showToolbar: !live,
    showCursor: live && !status && !options.hasRunningRow,
    isSettled: !live,
  };
}
