import type { LegacyChatMessage } from '../types/domain';
import { tf, translate } from './labels.js';

/** Presentation model for the top activity and thinking summary pill. */
export function turnSummaryOf(message: LegacyChatMessage, live: boolean, showsStatus = Boolean(message._liveStatus)) {
  const summary = typeof message.summary === 'string' ? message.summary.trim() : '';
  const task = live && typeof message._taskSummary === 'string' ? message._taskSummary.trim() : '';
  const reasoningContent = typeof message.reasoningContent === 'string' ? message.reasoningContent.trim() : '';
  const hasThinking = Boolean(reasoningContent);
  const durationSec = (typeof message.reasoningDurationSec === 'number' && message.reasoningDurationSec > 0)
    ? message.reasoningDurationSec
    : (typeof (message as any)._reasoningDurationSec === 'number' && (message as any)._reasoningDurationSec > 0)
      ? (message as any)._reasoningDurationSec
      : 0;

  let label: string;
  if (hasThinking && !live) {
    label = durationSec > 0
      ? tf('think.thoughtDuration', `Thought for ${durationSec}s`, { sec: durationSec })
      : translate('think.complete', 'Thought complete');
  } else {
    label = translate('think.process', 'Process');
  }

  return {
    // Tool rows already own execution facts. A task preview alone must not
    // leave a process disclosure above a completed, ordinary answer.
    hasWork: Boolean(summary || hasThinking || (live && showsStatus)),
    label,
    summary: summary || task || (live
      ? translate('think.waitingForResponse', 'Waiting for the response.')
      : translate('think.summaryThinking', 'Thinking complete.')),
    task,
    hasThinking,
    durationSec,
  };
}
