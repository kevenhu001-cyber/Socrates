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

/** A startup activity signal is not evidence that the provider is reasoning. */
function hasObservedReasoning(message: LegacyChatMessage): boolean {
  if (typeof message.reasoningContent === 'string' && message.reasoningContent.trim()) return true;
  const raw = typeof message.rawText === 'string' ? message.rawText : '';
  return Boolean(raw.match(/<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/i)?.[1]?.trim());
}

function observedStatus(message: LegacyChatMessage, activity: PublicTurnActivity): LiveTurnStatus | undefined {
  const legacy = message._liveStatus;
  switch (activity.type) {
    case 'thinking':
      if (hasVisibleAnswerText(message)) return undefined;
      return hasObservedReasoning(message)
        ? { phase: 'thinking', label: translate('think.thinking', 'Thinking…'), elapsedSec: legacy?.phase === 'thinking' ? legacy.elapsedSec : undefined }
        : { phase: 'waiting', label: translate('think.waitingForResponse', 'Waiting for the response.'), elapsedSec: legacy?.phase === 'waiting' ? legacy.elapsedSec : undefined };
    case 'public_reasoning_summary': return { phase: 'thinking', label: activity.text };
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
  const activities = message.turnRuntime?.activities || [];
  // Intent previews and completed observations are never reasoning summaries.
  const reasoningSummaries = activities.filter((entry) => entry.kind === 'reasoning_summary' && entry.text?.trim());
  const publicSummary = reasoningSummaries[reasoningSummaries.length - 1]?.text?.trim()
    || (activity?.type === 'public_reasoning_summary' ? activity.text : '');
  const ranges = activities.filter((entry) => ['reasoning', 'reasoning_summary'].includes(entry.kind) && entry.endedAt !== undefined)
    .map((entry) => [entry.startedAt, entry.endedAt!] as const).sort((a, b) => a[0] - b[0]);
  let reasoningMs = 0;
  let end = 0;
  for (const range of ranges) {
    reasoningMs += Math.max(0, range[1] - Math.max(end, range[0]));
    end = Math.max(end, range[1]);
  }
  return {
    activities,
    reasoningSummaries,
    showReasoningSummary: Boolean(publicSummary),
    primaryActivity: activity,
    status,
    intentSummary: live ? message._taskSummary?.trim() || '' : '',
    outcomeSummary: !live ? message.summary?.trim() || '' : '',
    publicSummary,
    reasoningDurationSec: reasoningMs > 0 ? reasoningMs / 1000 : undefined,
    showToolbar: !live,
    showCursor: live && !status && !options.hasRunningRow,
    isSettled: !live,
  };
}
