import type { ChatRequest, ChatSseHandlers, MobileTokenPair, Project, Session, User } from '@socrates/contracts';
import { consumeSseBuffer, dispatchChatSseFrame } from '@socrates/core';
import type { KeyValueStore } from '@socrates/platform';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type TokenState = Partial<MobileTokenPair>;

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function createApiClient(input: { baseUrl: string; fetch: FetchLike; storage: KeyValueStore }) {
  const tokenKey = 'socrates.auth.tokens';
  const readTokens = async (): Promise<TokenState> => JSON.parse(await input.storage.get(tokenKey) || '{}') as TokenState;
  const writeTokens = (tokens: TokenState) => input.storage.set(tokenKey, JSON.stringify(tokens));
  const clearTokens = () => input.storage.remove(tokenKey);
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const tokens = await readTokens();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (tokens.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    const response = await input.fetch(`${input.baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) as unknown : null;
    if (!response.ok) throw new ApiError(response.status, (body as { message?: string } | null)?.message || `HTTP ${response.status}`, body);
    return body as T;
  };
  return {
    request,
    auth: {
      me: async () => (await request<{ user: User }>('/auth/me')).user,
      login: async (email: string, password: string) => {
        const result = await request<{ user: User } & MobileTokenPair>('/auth/mobile/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        await writeTokens(result);
        return result.user;
      },
      logout: async () => { try { await request('/auth/mobile/logout', { method: 'POST' }); } finally { await clearTokens(); } },
    },
    sessions: {
      list: async () => (await request<{ sessions: Session[] }>('/sessions?limit=50')).sessions,
      get: (id: string) => request<Session>(`/sessions/${encodeURIComponent(id)}`),
      save: (session: Session) => request<Session>('/sessions', { method: 'POST', body: JSON.stringify(session) }),
      // Subset of the server PATCH allowlist used by the Universal App.
      // projectId moves a session between projects (null = unfiled).
      patch: (id: string, patch: Partial<Pick<Session, 'title' | 'topic' | 'pinned' | 'projectId'>>) =>
        request<Session>(`/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      archive: (id: string) => request<{ ok: true }>(`/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
      unarchive: (id: string) => request<{ ok: true }>(`/sessions/${encodeURIComponent(id)}/archive`, { method: 'DELETE' }),
    },
    projects: {
      list: async () => (await request<{ projects: Project[] }>('/projects')).projects,
      create: (input: Pick<Project, 'name'> & Partial<Pick<Project, 'description' | 'color' | 'icon' | 'systemPrompt'>>) =>
        request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
      update: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'color' | 'icon' | 'systemPrompt'>>) =>
        request<Project>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      remove: (id: string) => request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    chatUrl: (sessionId?: string) => `${input.baseUrl}/chat/stream${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    readTokens,
  };
}

export async function readChatStream(response: Response, handlers: ChatSseHandlers) {
  if (!response.body) throw new ApiError(response.status, 'Stream unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBuffer(buffer, (frame) => dispatchChatSseFrame(frame, handlers));
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatchChatSseFrame(buffer, handlers);
}

export async function startChatStream(input: { url: string; request: ChatRequest; fetch: FetchLike; token?: string; handlers: ChatSseHandlers; signal?: AbortSignal }) {
  const response = await input.fetch(input.url, { method: 'POST', headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}) }, body: JSON.stringify(input.request), signal: input.signal });
  if (!response.ok) throw new ApiError(response.status, `Stream failed (${response.status})`);
  await readChatStream(response, input.handlers);
}
