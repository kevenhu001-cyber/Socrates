import { createApiClient, startChatStream } from '@socrates/api';
import type { ChatRequest, ChatSseHandlers, Message } from '@socrates/contracts';
import { storage } from './storage';

const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
const baseUrl = runtime.process?.env?.EXPO_PUBLIC_API_BASE_URL || 'https://app.topodrive.top/api/v2';
export const api = createApiClient({ baseUrl, fetch: globalThis.fetch.bind(globalThis), storage });

export async function streamConversation(input: {
  sessionId: string;
  messages: Message[];
  handlers: ChatSseHandlers;
  signal: AbortSignal;
}) {
  const tokens = await api.readTokens();
  const request: ChatRequest = {
    mode: 'chat',
    sessionId: input.sessionId,
    messages: input.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
      .map((message) => ({ role: message.role, content: message.rawText || message.content || '' })),
  };
  return startChatStream({
    url: api.chatUrl(input.sessionId),
    request,
    fetch: globalThis.fetch.bind(globalThis),
    token: tokens.accessToken,
    handlers: input.handlers,
    signal: input.signal,
  });
}
