import { createApiClient } from '@socrates/api';
import { transportFetch } from './transport';
import { buildChatHistory } from '@socrates/core';
import { useAuthStore } from '@socrates/auth';
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
  const request: ChatRequest = {
    mode: 'chat',
    sessionId: input.sessionId,
    messages: buildChatHistory(input.messages.filter((message) => message.role !== 'tool'), { maxChars: 200_000 })
      .map(({ role, content }) => ({ role, content })),
  };
  return api.chat.stream({
    sessionId: input.sessionId,
    request,
    handlers: input.handlers,
    signal: input.signal,
  });
}
