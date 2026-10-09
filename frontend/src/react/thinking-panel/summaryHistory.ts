import { stripChatArtifacts } from '../../util/stripChatArtifacts.js';
import { toolRunLabel } from '../tool-run/labels.js';
import { toolRunStateOf, type ToolCallRecord } from '../tool-run/toolRunModel.ts';
import type { LegacyChatMessage } from '../types/domain';
import type { ThinkingPanelActivity, ThinkingPanelSnapshot } from './types';

type SummaryMessage = LegacyChatMessage & {
  toolCalls?: readonly ToolCallRecord[];
  _toolRunRev?: number;
  /* P_turn-summary — the model's own one-line retrospective, sent after the
     answer and persisted on the message. Preferred over a sliced preview
     because it describes the WORK, not the answer. */
  summary?: string;
};

export interface SummaryHistoryTurn {
  id: string;
  question: string;
  answerPreview: string;
  streaming: boolean;
  activities: readonly ThinkingPanelActivity[];
}

type CachedText = { source: string; value: string };
type CachedActivities = {
  calls: SummaryMessage['toolCalls'];
  revision: number;
  value: readonly ThinkingPanelActivity[];
};

const previewCache = new WeakMap<object, CachedText>();
const activityCache = new WeakMap<object, CachedActivities>();

function compact(text: string, limit: number): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= limit ? value : value.slice(0, limit - 1).trimEnd() + '…';
}

function answerPreview(message: SummaryMessage): string {
  /* P_turn-summary — the model's own retrospective wins: it describes the
     work (what was searched, run, or concluded) rather than re-quoting the
     answer. Fall back to the mechanical first-sentence slice when the
     summary never arrived (generation failed, or an older persisted turn). */
  const modelSummary = typeof message.summary === 'string' ? message.summary.trim() : '';
  if (modelSummary) return compact(modelSummary, 220);
  if (message.type === 'streaming') return '';
  const source = typeof message.rawText === 'string' ? message.rawText : '';
  if (!source) return '';
  const cached = previewCache.get(message);
  if (cached?.source === source) return cached.value;
  const visible = stripChatArtifacts(source)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}|[-*+]\s|>\s?)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const punctuation = visible.search(/[.!?。！？](?:\s|$)/u);
  const firstSentence = punctuation >= 0 ? visible.slice(0, punctuation + 1) : visible;
  const value = compact(firstSentence, 220);
  previewCache.set(message, { source, value });
  return value;
}

function activitiesFor(
  message: SummaryMessage,
  messageId: string,
  liveSnapshot: ThinkingPanelSnapshot,
): readonly ThinkingPanelActivity[] {
  const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const revision = message._toolRunRev || 0;
  let activities: readonly ThinkingPanelActivity[];
  const cached = activityCache.get(message);
  if (cached && cached.calls === message.toolCalls && cached.revision === revision) {
    activities = cached.value;
  } else {
    activities = Object.freeze(calls.map((call, index) => {
      const state = toolRunStateOf(call);
      return Object.freeze({
        id: String(call.id || `${messageId}-tool-${index}`),
        toolName: String(call.name || ''),
        label: toolRunLabel(call, state).text,
        state,
      });
    }));
    activityCache.set(message, { calls: message.toolCalls, revision, value: activities });
  }
  if (liveSnapshot.messageId !== messageId || liveSnapshot.activities.length === 0) return activities;
  const merged = new Map(activities.map((activity) => [activity.id, activity]));
  for (const activity of liveSnapshot.activities) merged.set(activity.id, activity);
  return Object.freeze([...merged.values()]);
}

export function buildSummaryHistory(
  messages: ReadonlyArray<LegacyChatMessage>,
  liveSnapshot: ThinkingPanelSnapshot,
): SummaryHistoryTurn[] {
  const history: SummaryHistoryTurn[] = [];
  let question = '';
  let assistantNumber = 0;
  for (const entry of messages) {
    if (entry.role === 'user') {
      question = compact(typeof entry.rawText === 'string' ? entry.rawText : '', 140);
      continue;
    }
    if (entry.role !== 'assistant' || entry.type === 'summary' || entry.clientId === 'context-summary') continue;
    const message = entry as SummaryMessage;
    const id = String(message.clientId || message.id || `assistant-${assistantNumber}`);
    const streaming = message.type === 'streaming'
      || (liveSnapshot.messageId === id && liveSnapshot.streaming);
    const activities = activitiesFor(message, id, liveSnapshot);
    const hasText = typeof message.rawText === 'string' && message.rawText.length > 0;
    if (!streaming && !hasText && activities.length === 0) continue;
    assistantNumber += 1;
    history.push({
      id,
      question,
      answerPreview: answerPreview(message),
      streaming,
      activities,
    });
    question = '';
  }
  return history;
}
