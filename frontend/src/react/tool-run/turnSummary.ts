import type { LegacyChatMessage } from '../types/domain';
import { translate } from './labels.js';

/** Only public summaries and tool facts enter the presentation model. */
export function turnSummaryOf(message: LegacyChatMessage, live: boolean, showsStatus = Boolean(message._liveStatus)) {
  const summary = typeof message.summary === 'string' ? message.summary.trim() : '';
  const task = live && typeof message._taskSummary === 'string' ? message._taskSummary.trim() : '';
  const hasThinking = Boolean(message.reasoningContent?.trim());
  const label = hasThinking && !live
    ? translate('think.complete', 'Thought complete')
    : translate('think.process', 'Process');
  return {
    // Tool rows already own execution facts. A task preview alone must not
    // leave a process disclosure above a completed, ordinary answer.
    hasWork: Boolean(summary || hasThinking || (live && showsStatus)),
    label,
    summary: summary || task || (live
      ? translate('think.waitingForResponse', 'Waiting for the response.')
      : translate('think.summaryThinking', 'Thinking complete.')),
  };
}
