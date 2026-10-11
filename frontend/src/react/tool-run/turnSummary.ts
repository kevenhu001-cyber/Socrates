import type { LegacyChatMessage } from '../types/domain';
import { tf, toolRunLabel, translate } from './labels.js';
import { toolRunStateOf, type ToolCallRecord } from './toolRunModel.ts';

/** Only public summaries and tool facts enter the presentation model. */
export function turnSummaryOf(message: LegacyChatMessage, live: boolean) {
  const calls = Array.isArray(message.toolCalls) ? message.toolCalls as ToolCallRecord[] : [];
  const summary = typeof message.summary === 'string' ? message.summary.trim() : '';
  const hasThinking = Boolean(message.reasoningContent?.trim());
  const activities = calls.map((call) => {
    const state = toolRunStateOf(call);
    return { id: call.id, name: call.name, state, label: toolRunLabel(call, state).text };
  });
  const label = calls.length || !hasThinking
    ? translate('think.process', 'Process')
    : translate('think.complete', 'Thought complete');
  const fallback = calls.length
    ? tf('think.summaryTools', 'Tools used: {n}.', { n: calls.length })
    : hasThinking
      ? translate('think.summaryThinking', 'Thinking complete.')
      : translate('think.noSummary', 'No activity summary is available.');
  return {
    hasWork: Boolean(summary || hasThinking || calls.length || (live && message._liveStatus)),
    label,
    summary: summary || (live
      ? translate('think.waitingForResponse', 'Waiting for the response.')
      : fallback),
    activities,
  };
}
