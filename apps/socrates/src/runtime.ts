import { createApiClient } from '@socrates/api';
import { transportFetch } from './transport';
import { buildChatHistory } from '@socrates/core';
import { useAuthStore } from '@socrates/auth';
import { useChatStore } from '@socrates/chat';
import { toneVoice, useSettingsStore } from '@socrates/settings';
import { buildTutorVoice, diagnosticPointsForNode, type DiagQuestion } from '@socrates/ui';
import type { ChatRequest, ChatSseHandlers, Message } from '@socrates/contracts';
import { storage } from './storage';

// Expo statically substitutes direct public env reads in Web/native bundles.
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://app.topodrive.top/api/v2';
export const api = createApiClient({
  baseUrl,
  fetch: transportFetch,
  storage,
  // A rejected refresh means the rotating credential is dead — drop back to
  // AuthGate without calling logout (the server already refused it).
  onAuthLost: () => { void useAuthStore.getState().signOut(storage, async () => {}); },
});

export async function streamConversation(input: {
  sessionId: string;
  messages: Message[];
  handlers: ChatSseHandlers;
  signal: AbortSignal;
}) {
  // Tone parity with the web baseline: the selected preset's voice always
  // leads the model-facing history as the system message (the persisted
  // session keeps user/assistant turns only — same split as runChatTurn).
  // Tutor sessions lead with the Socratic stage voice instead: foundation
  // anchor + current stage + diagnostic knowledge points for the node.
  const session = useChatStore.getState().sessions.find((s) => s.id === input.sessionId);
  const tutor = session?.mode === 'tutor' ? session : null;
  const history = buildChatHistory(input.messages.filter((message) => message.role !== 'tool'), { maxChars: 200_000 });
  const historyMessages = history.map(({ role, content }) => ({ role, content }));
  let system: string;
  if (tutor) {
    const kbNodes = (tutor.kbNodes || []) as Array<{ name?: string; status?: string }>;
    const nodeIdx = typeof tutor.currentNode === 'number' ? tutor.currentNode : 0;
    const node = kbNodes[nodeIdx];
    const questions = ((tutor.tutorData?.questions as unknown as DiagQuestion[]) || []);
    const rawAnswers = (tutor.tutorData?.answers || {}) as Record<string, unknown>;
    const answers: Record<number, number> = {};
    for (const [key, value] of Object.entries(rawAnswers)) {
      if (typeof value === 'number') answers[Number(key)] = value;
    }
    const hasAssistantTurn = input.messages.some((message) => message.role === 'assistant');
    system = buildTutorVoice({
      topic: tutor.topic,
      stage: tutor.teachingStage || 'motivate',
      nodeName: node?.name,
      nodeStatus: node?.status,
      isFirst: !hasAssistantTurn,
      knowledgePoints: diagnosticPointsForNode(questions, answers, nodeIdx),
    });
  } else {
    system = toneVoice(useSettingsStore.getState().tone);
  }
  const request: ChatRequest = {
    mode: tutor ? 'tutor' : 'chat',
    sessionId: input.sessionId,
    messages: [
      { role: 'system', content: system },
      ...historyMessages,
    ],
  };
  return api.chat.stream({
    sessionId: input.sessionId,
    request,
    handlers: input.handlers,
    signal: input.signal,
  });
}
