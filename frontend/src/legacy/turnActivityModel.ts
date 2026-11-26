import type { PublicTurnActivity } from '@socrates/contracts';
import type { ChatMessage, LiveTurnStatus } from '../react/types/domain';
import { toolRunStateOf } from './toolPresentationState';
import { toolRunLabel, translate, type ToolCallLike } from './toolPresentationModel';

/** Validate progress at the transport boundary. No reasoning-text extraction. */
export function normalizePublicTurnActivity(value: unknown): PublicTurnActivity | null {
  if (!value || typeof value !== 'object') return null;
  const activity = value as Record<string, unknown>;
  switch (activity.type) {
    case 'thinking':
    case 'synthesizing':
      return { type: activity.type };
    case 'tool':
      return typeof activity.toolCallId === 'string' && typeof activity.toolName === 'string'
        ? { type: 'tool', toolCallId: activity.toolCallId, toolName: activity.toolName }
        : null;
    case 'public_reasoning_summary':
      return typeof activity.text === 'string' && activity.text.trim()
        ? { type: 'public_reasoning_summary', text: activity.text.trim().slice(0, 500) }
        : null;
    case 'done':
      return { type: 'done', durationMs: validDuration(activity.durationMs) };
    default:
      return null;
  }
}

function validDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

interface PresentationOptions {
  live?: boolean;
  answerStarted?: boolean;
  hasRunningRow?: boolean;
  hasSettledTool?: boolean;
  activeTool?: ToolCallLike;
}

export type TurnActivityStatus = Pick<LiveTurnStatus, 'toolName' | 'label' | 'elapsedSec'> & {
  phase: LiveTurnStatus['phase'] | 'answering' | 'tool-awaiting';
};

/**
 * Provider reasoning and public answer text share the same raw stream field
 * for a few legacy providers. Treat a think-only payload as non-answer text
 * so the live activity line can stay visible until the first real prose.
 */
function hasVisibleAnswerText(message: ChatMessage): boolean {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  return rawText.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '').trim().length > 0;
}

/** A startup activity signal is not evidence that the provider is reasoning. */
function hasObservedReasoning(message: ChatMessage): boolean {
  if (typeof message.reasoningContent === 'string' && message.reasoningContent.trim()) return true;
  const raw = typeof message.rawText === 'string' ? message.rawText : '';
  return Boolean(raw.match(/<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/i)?.[1]?.trim());
}

function observedThinkingStatus(message: ChatMessage): LiveTurnStatus {
  const legacy = message._liveStatus;
  const reasoningHasStarted = hasObservedReasoning(message);
  const phase = hasVisibleAnswerText(message) || reasoningHasStarted ? 'thinking' : 'waiting';
  return {
    phase,
    label:
      phase === 'thinking'
        ? translate('think.thinking', 'Thinking…')
        : translate('think.waitingForResponse', 'Waiting for the response.'),
    elapsedSec: legacy?.phase === phase ? legacy.elapsedSec : undefined,
  };
}

function observedToolStatus(
  message: ChatMessage,
  activity: Extract<PublicTurnActivity, { type: 'tool' }>,
): LiveTurnStatus | undefined {
  const call = message.toolCalls?.find((entry) => entry.id === activity.toolCallId);
  if (call && !['running', 'awaiting'].includes(toolRunStateOf(call))) return undefined;
  const label = toolRunLabel(call || { name: activity.toolName }, 'running').text;
  return { phase: 'tool-running', toolName: activity.toolName, label };
}

function observedStatus(
  message: ChatMessage,
  activity: PublicTurnActivity,
): LiveTurnStatus | undefined {
  switch (activity.type) {
    case 'thinking':
      return observedThinkingStatus(message);
    case 'public_reasoning_summary':
      return hasVisibleAnswerText(message)
        ? undefined
        : { phase: 'thinking', label: translate('think.thinking', 'Thinking…') };
    case 'synthesizing':
      return hasVisibleAnswerText(message)
        ? undefined
        : { phase: 'synthesizing', label: translate('think.synthesizing', 'Preparing the answer') };
    case 'tool':
      return observedToolStatus(message, activity);
    case 'done':
      return undefined;
  }
}

function selectedStatus(
  message: ChatMessage,
  activity: PublicTurnActivity | null,
  live: boolean,
  options: PresentationOptions,
): LiveTurnStatus | undefined {
  const legacy = message._liveStatus || undefined;
  if (legacy?.phase === 'error' || legacy?.phase === 'stopped') return legacy;
  if (live && legacy?.phase === 'retrying') return legacy;
  if (!live || options.hasRunningRow) return undefined;
  if (activity) return observedStatus(message, activity);
  return legacy?.phase === 'tool-running' && options.hasSettledTool ? undefined : legacy;
}

function reasoningSummaryState(
  activities: NonNullable<ChatMessage['turnRuntime']>['activities'],
  activity: PublicTurnActivity | null,
) {
  const reasoningSummaries = activities.filter(
    (entry) => entry.kind === 'reasoning_summary' && entry.text?.trim(),
  );
  const publicSummary =
    reasoningSummaries[reasoningSummaries.length - 1]?.text?.trim() ||
    (activity?.type === 'public_reasoning_summary' ? activity.text : '');
  return { reasoningSummaries, publicSummary };
}

function reasoningDurationSeconds(
  activities: NonNullable<ChatMessage['turnRuntime']>['activities'],
  fallback: number | null | undefined,
): number | undefined {
  const ranges = activities
    .filter(
      (entry) =>
        ['reasoning', 'reasoning_summary'].includes(entry.kind) && entry.endedAt !== undefined,
    )
    .map((entry) => [entry.startedAt, entry.endedAt!] as const)
    .sort((a, b) => a[0] - b[0]);
  let durationMs = 0;
  let end = 0;
  for (const [start, finish] of ranges) {
    durationMs += Math.max(0, finish - Math.max(end, start));
    end = Math.max(end, finish);
  }
  return durationMs > 0
    ? durationMs / 1000
    : typeof fallback === 'number' && fallback > 0
      ? fallback
      : undefined;
}

function activityStatusFor(
  status: LiveTurnStatus | undefined,
  live: boolean,
  options: PresentationOptions,
  answerStarted: boolean,
): TurnActivityStatus | undefined {
  if (!live || status?.phase === 'error' || status?.phase === 'stopped') return undefined;
  if (status?.phase === 'retrying') return status;
  if (options.activeTool) {
    const state = toolRunStateOf(options.activeTool);
    return {
      phase: state === 'awaiting' ? 'tool-awaiting' : 'tool-running',
      toolName: options.activeTool.name,
      label: toolRunLabel(options.activeTool, state).text,
    };
  }
  if (status?.phase === 'tool-running') {
    return {
      ...status,
      label: toolRunLabel({ name: status.toolName || '' }, 'running').text,
    };
  }
  if (answerStarted) {
    return { phase: 'answering', label: translate('think.answering', 'Writing the answer…') };
  }
  return (
    status || {
      phase: 'waiting',
      label: translate('think.waitingForResponse', 'Waiting for the response.'),
    }
  );
}

function activityLabelFor(
  status: TurnActivityStatus | undefined,
  intentSummary: string,
): string | undefined {
  return status?.phase === 'waiting' && intentSummary ? intentSummary : status?.label;
}

/** One owner for activity, terminal notices, cursor and toolbar visibility.
 * A mounted running tool owns activity; a deferred tool retains its status.
 * Transport completion is distinct from playback completion: a done event
 * cannot mount actions while the final text is still draining. */
type RuntimeActivities = NonNullable<ChatMessage['turnRuntime']>['activities'];

function findRunningActivityStartedAt(
  activities: RuntimeActivities,
  activityStatus: TurnActivityStatus | undefined,
): number | undefined {
  if (!activityStatus) return undefined;
  const matchKind =
    activityStatus.phase === 'thinking'
      ? 'reasoning'
      : activityStatus.phase === 'waiting'
        ? 'waiting'
        : activityStatus.phase === 'synthesizing'
          ? 'synthesis'
          : null;
  if (!matchKind) return undefined;
  for (const entry of activities) {
    if (entry.phase === 'running' && entry.kind === matchKind) {
      return entry.startedAt;
    }
  }
  return undefined;
}

function deriveSummaries(
  message: ChatMessage,
  live: boolean,
  activities: RuntimeActivities,
  activity: PublicTurnActivity | null,
) {
  const { reasoningSummaries, publicSummary } = reasoningSummaryState(activities, activity);
  const intentSummary = live ? message._taskSummary?.trim() || '' : '';
  const outcomeSummary = !live ? message.summary?.trim() || '' : '';
  const reasoningDurationSec = reasoningDurationSeconds(activities, message.reasoningDurationSec);
  return {
    reasoningSummaries,
    publicSummary,
    intentSummary,
    outcomeSummary,
    reasoningDurationSec,
  };
}

function isLiveTurn(message: ChatMessage, options: PresentationOptions): boolean {
  if (options.live !== undefined) return options.live;
  return message.type === 'streaming' && message._streamSettled !== true;
}

export function deriveTurnPresentationState(
  message: ChatMessage,
  options: PresentationOptions = {},
) {
  const live = isLiveTurn(message, options);
  const activity = normalizePublicTurnActivity(message._activity);
  const status = selectedStatus(message, activity, live, options);
  const activities = message.turnRuntime?.activities || [];
  const summaries = deriveSummaries(message, live, activities, activity);
  const answerStarted = options.answerStarted ?? hasVisibleAnswerText(message);
  const activityStatus = activityStatusFor(status, live, options, answerStarted);
  const activityStartedAt = findRunningActivityStartedAt(activities, activityStatus);

  return {
    activityStatus,
    activityStartedAt,
    activityLabel: activityLabelFor(activityStatus, summaries.intentSummary),
    activityLive: live && Boolean(activityStatus),
    activities,
    reasoningSummaries: summaries.reasoningSummaries,
    showReasoningSummary: Boolean(summaries.publicSummary),
    primaryActivity: activity,
    status,
    intentSummary: summaries.intentSummary,
    outcomeSummary: summaries.outcomeSummary,
    publicSummary: summaries.publicSummary,
    reasoningDurationSec: summaries.reasoningDurationSec,
    showToolbar: !live,
    showCursor: live && !status && !options.hasRunningRow,
    isSettled: !live,
  };
}
