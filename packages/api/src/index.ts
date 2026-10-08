import type { AccountUsage, Assistant, ChatRequest, ChatSseHandlers, FileExtractResult, MobileTokenPair, Project, ProviderKey, SearchHit, Session, SessionShare, ShareVisibility, StoredFile, StoredFilePreview, User } from '@socrates/contracts';
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

/* Access tokens are short-lived; refresh a little early so a request that
 * starts valid does not expire mid-flight. Mirrors the frozen mobile
 * client's 30 s skew. */
const REFRESH_SKEW_MS = 30_000;
/* Credential-issuing endpoints never trigger a transparent refresh: a 401
 * from login/refresh/logout is the real answer, not an expired bearer.
 * The same holds for the web credential endpoints the Universal App calls
 * directly (code/register/forgot/password): a wrong code or old password
 * must surface as an error, never rotate or clear the live session. */
const MOBILE_AUTH_PATH = '/auth/mobile/';
const CREDENTIAL_PATHS = [
  '/auth/send-code',
  '/auth/login-with-code',
  '/auth/register',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/password',
];

export function createApiClient(input: {
  baseUrl: string;
  fetch: FetchLike;
  storage: KeyValueStore;
  /** Called once when a refresh attempt is rejected — the stored session is
   * dead and the app should return to the signed-out state. */
  onAuthLost?: () => void;
}) {
  const tokenKey = 'socrates.auth.tokens';
  let generation = 0;
  let mutations: Promise<unknown> = Promise.resolve();
  const mutate = <T>(action: () => Promise<T>): Promise<T> => {
    const pending = mutations.then(action);
    mutations = pending.catch(() => undefined);
    return pending;
  };
  const readTokens = async (): Promise<TokenState> => {
    await mutations;
    const raw = await input.storage.get(tokenKey);
    try { return raw ? JSON.parse(raw) as TokenState : {}; }
    catch { return {}; }
  };
  const invalidateSession = () => {
    generation++;
    refreshInFlight = null;
    return mutate(() => input.storage.remove(tokenKey));
  };
  const isCredentialUrl = (url: string) => {
    const path = new URL(url).pathname;
    return path.includes(MOBILE_AUTH_PATH) || CREDENTIAL_PATHS.some((suffix) => path.endsWith(suffix));
  };
  const expiresSoon = (tokens: TokenState) => {
    const at = Date.parse(tokens.expiresAt || '');
    return Number.isFinite(at) && at - Date.now() <= REFRESH_SKEW_MS;
  };

  let refreshInFlight: Promise<boolean> | null = null;
  const refresh = (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight;
    const epoch = generation;
    const pending = (async () => {
      const current = await readTokens();
      if (epoch !== generation || !current.refreshToken) return false;
      const response = await input.fetch(`${input.baseUrl}${MOBILE_AUTH_PATH}refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (epoch !== generation) return false;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const invalidating = invalidateSession();
          const invalidated = generation;
          await invalidating;
          if (generation === invalidated) input.onAuthLost?.();
          return false;
        }
        throw new ApiError(response.status, `Session refresh failed (${response.status}). Please retry.`);
      }
      const tokens = await response.json() as TokenState;
      if (!tokens.accessToken || !tokens.refreshToken) throw new ApiError(502, 'Invalid session refresh response');
      return mutate(async () => {
        if (epoch !== generation) return false;
        await input.storage.set(tokenKey, JSON.stringify(tokens));
        return true;
      });
    })();
    refreshInFlight = pending;
    void pending.finally(() => { if (refreshInFlight === pending) refreshInFlight = null; }).catch(() => undefined);
    return pending;
  };
  const authorizedInit = (init: RequestInit, tokens: TokenState): RequestInit => {
    const headers = new Headers(init.headers);
    if (tokens.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    else headers.delete('Authorization');
    return { ...init, headers };
  };
  const fetchWithAuth = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const epoch = generation;
    const checkCurrent = () => {
      if (epoch !== generation) throw new ApiError(401, 'Session changed');
      if (init.signal?.aborted) throw new ApiError(499, 'Request canceled');
    };
    let tokens = await readTokens();
    const authEndpoint = isCredentialUrl(url);
    if (!authEndpoint && tokens.refreshToken && expiresSoon(tokens)) {
      if (!await refresh()) throw new ApiError(401, 'Session expired');
      tokens = await readTokens();
    }
    checkCurrent();
    let response = await input.fetch(url, authorizedInit(init, tokens));
    checkCurrent();
    if (response.status === 401 && tokens.refreshToken && !authEndpoint) {
      const latest = await readTokens();
      // A late 401 from an old bearer reuses the already rotated token.
      const rotated = latest.accessToken && latest.accessToken !== tokens.accessToken;
      if (rotated || await refresh()) {
        checkCurrent();
        response = await input.fetch(url, authorizedInit(init, await readTokens()));
        checkCurrent();
      }
    }
    if (response.status === 401 && !authEndpoint && tokens.accessToken && epoch === generation) {
      const invalidating = invalidateSession();
      const invalidated = generation;
      await invalidating;
      if (generation === invalidated) input.onAuthLost?.();
    }
    return response;
  };

  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetchWithAuth(`${input.baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text) as unknown; }
      catch { if (response.ok) throw new ApiError(502, 'Invalid API response'); }
    }
    if (!response.ok) throw new ApiError(response.status, (body as { message?: string } | null)?.message || `HTTP ${response.status}`, body);
    return body as T;
  };
  const chatUrl = (sessionId?: string) => `${input.baseUrl}/chat/stream${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`;
  const listSessionPage = (extra: string, cursor: string | null) =>
    request<{ sessions: Session[]; nextCursor?: string | null }>(`/sessions?limit=50${extra}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  const listAllSessions = async (extra: string) => {
    const sessions: Session[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page = await listSessionPage(extra, cursor);
      sessions.push(...page.sessions);
      cursor = page.nextCursor || null;
      if (cursor && seen.has(cursor)) throw new ApiError(502, 'Session pagination did not advance');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return sessions;
  };
  return {
    request,
    refresh,
    fetchWithAuth,
    invalidateSession,
    auth: {
      me: async () => (await request<{ user: User }>('/auth/me')).user,
      login: async (email: string, password: string) => {
        const epoch = ++generation;
        refreshInFlight = null;
        const result = await request<{ user: User } & MobileTokenPair>('/auth/mobile/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        await mutate(async () => {
          if (epoch !== generation) throw new ApiError(401, 'Session changed');
          await input.storage.set(tokenKey, JSON.stringify(result));
        });
        return result.user;
      },
      /* Passwordless: code is emailed via the shared /auth/send-code
       * (no auth needed), then exchanged for a mobile token pair. */
      sendCode: (email: string) =>
        request<{ ok: boolean }>('/auth/send-code', { method: 'POST', body: JSON.stringify({ email }) }),
      loginWithCode: async (email: string, code: string) => {
        const epoch = ++generation;
        refreshInFlight = null;
        const result = await request<{ user: User } & MobileTokenPair>('/auth/mobile/login-with-code', { method: 'POST', body: JSON.stringify({ email, code }) });
        await mutate(async () => {
          if (epoch !== generation) throw new ApiError(401, 'Session changed');
          await input.storage.set(tokenKey, JSON.stringify(result));
        });
        return result.user;
      },
      /* Registration only creates a pending account and emails a
       * verification link (web link — the user signs in here afterwards).
       * Same anti-enumeration shape for forgot-password. */
      register: (email: string, password: string) =>
        request<{ ok: boolean }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
      resendVerification: (email: string) =>
        request<{ ok: boolean }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
      forgotPassword: (email: string) =>
        request<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
      changePassword: (oldPassword: string, newPassword: string) =>
        request<{ ok: boolean }>('/auth/password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) }),
      logout: async () => {
        generation++;
        refreshInFlight = null;
        const tokens = await mutate(async () => {
          const raw = await input.storage.get(tokenKey);
          await input.storage.remove(tokenKey);
          try { return JSON.parse(raw || '{}') as TokenState; } catch { return {}; }
        });
        await input.fetch(`${input.baseUrl}/auth/mobile/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      },
    },
    sessions: {
      list: () => listAllSessions(''),
      /* Archived rows are excluded from the default list; the sidebar
       * Archived section pages them separately (same cursor contract). */
      listArchived: () => listAllSessions('&archived=true'),
      get: (id: string) => request<Session>(`/sessions/${encodeURIComponent(id)}`),
      save: (session: Session) => request<Session>('/sessions', { method: 'POST', body: JSON.stringify(session) }),
      // Subset of the server PATCH allowlist used by the Universal App.
      // projectId moves a session between projects (null = unfiled);
      // kind/examData persist the exam surface (answers + submitted);
      // assistantId binds (or null clears) the session's persona.
      patch: (id: string, patch: Partial<Pick<Session, 'title' | 'topic' | 'pinned' | 'projectId' | 'kind' | 'examData' | 'assistantId'>>) =>
        request<Session>(`/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      archive: (id: string) => request<{ ok: true }>(`/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
      unarchive: (id: string) => request<{ ok: true }>(`/sessions/${encodeURIComponent(id)}/archive`, { method: 'DELETE' }),
      /* DELETE purges the session and every row referencing it (messages,
       * files, artifacts, runs). Server replies 204 with an empty body. */
      remove: (id: string) => request<void>(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      share: (id: string) => request<SessionShare>(`/sessions/${encodeURIComponent(id)}/share`),
      createShare: (id: string, visibility: ShareVisibility) =>
        request<{ token: string; url: string; visibility: ShareVisibility | 'unlisted' }>(`/sessions/${encodeURIComponent(id)}/share`, { method: 'POST', body: JSON.stringify({ visibility }) }),
      revokeShare: (id: string) => request<void>(`/sessions/${encodeURIComponent(id)}/share`, { method: 'DELETE' }),
    },
    projects: {
      list: async () => (await request<{ projects: Project[] }>('/projects')).projects,
      create: (input: Pick<Project, 'name'> & Partial<Pick<Project, 'description' | 'color' | 'icon' | 'systemPrompt'>>) =>
        request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
      update: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'color' | 'icon' | 'systemPrompt'>>) =>
        request<Project>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      remove: (id: string) => request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    assistants: {
      /* User-authored personas (GET /api/creations/items/assistants). The
       * session's assistantId binds one to a conversation; the server
       * injects its instructions as a response-behavior block on every
       * turn. Config lives in a JSON `source` string — parse with
       * `assistantConfigOf` from @socrates/ui. */
      list: async () => (await request<{ items: Assistant[] }>('/creations/items/assistants')).items,
      create: (entry: { title: string; source: string }) =>
        request<Assistant>('/creations/items/assistants', { method: 'POST', body: JSON.stringify(entry) }),
      update: (id: string, entry: { title?: string; source?: string }) =>
        request<Assistant>(`/creations/items/assistants/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(entry) }),
      /* DELETE is idempotent server-side (unknown ids answer 204). */
      remove: (id: string) => request<void>(`/creations/items/assistants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    messages: {
      /* Edit a user turn in place. `discardFollowing` mirrors the local
       * rewind on the server (drops every later row so a reload never
       * resurfaces the stale reply); the Universal App re-asks locally
       * through the normal stream, so `regenerate` stays false and the
       * server must NOT also generate a reply. `sessionId` scopes the
       * ownership check to the session the op was queued against (an
       * outbox drain can run while another session is active). */
      patch: (id: string, body: { content: string; regenerate?: false; discardFollowing?: boolean }, sessionId?: string | null) =>
        request<{ ok: boolean }>(`/messages/${encodeURIComponent(id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`, { method: 'PATCH', body: JSON.stringify({ regenerate: false, ...body }) }),
      /* Remove one explicit row (outbox replay of a dropped tail). */
      remove: (id: string, sessionId?: string | null) =>
        request<void>(`/messages/${encodeURIComponent(id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`, { method: 'DELETE' }),
    },
    chat: {
      /* Chat goes through fetchWithAuth so a stream attempt refreshes and
       * retries once on 401 instead of surfacing a stale-bearer error. */
      stream: async (args: { sessionId?: string; request: ChatRequest; handlers: ChatSseHandlers; signal?: AbortSignal }) => {
        const response = await fetchWithAuth(chatUrl(args.sessionId), {
          method: 'POST',
          headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
          body: JSON.stringify(args.request),
          signal: args.signal,
        });
        if (!response.ok) throw new ApiError(response.status, `Stream failed (${response.status})`);
        await readChatStream(response, args.handlers);
      },
    },
    search: {
      /* Cmd-K backend (POST /api/search): full-text hits over sessions +
       * messages. Snippets may carry <mark> highlights; rendering strips
       * them — the transport never executes markup. */
      content: (input: { q: string; scope?: 'all' | 'sessions' | 'messages'; limit?: number }) =>
        request<{ hits: SearchHit[] }>('/search', { method: 'POST', body: JSON.stringify(input) }),
    },
    account: {
      /* Settings profile + usage (GET /api/account/usage). Read-only:
       * provider keys and billing actions stay on the web baseline. */
      usage: () => request<AccountUsage>('/account/usage'),
    },
    files: {
      /* Document text extraction (multipart `file` field). Goes through
       * fetchWithAuth so an expired bearer refreshes transparently; the
       * native picker uses FileSystem.uploadAsync with the same endpoint
       * (see filesExtractUrl) because RN fetch cannot stream file bodies. */
      extract: async (body: FormData) => {
        const response = await fetchWithAuth(`${input.baseUrl}/files/extract`, { method: 'POST', body });
        const parsed = await response.json().catch(() => null) as FileExtractResult | null;
        if (!response.ok || !parsed || parsed.ok === false) {
          throw new ApiError(response.status, parsed?.error || `Extraction failed (${response.status})`, parsed);
        }
        return parsed;
      },
      extractUrl: () => `${input.baseUrl}/files/extract`,
      /* POST /api/files — durable upload (multipart `file` + optional
       * `sessionId`). The web path posts a FormData body through
       * fetchWithAuth; the native path uses FileSystem.uploadAsync with this
       * URL and a raw bearer token (RN fetch cannot stream file bodies). */
      uploadUrl: () => `${input.baseUrl}/files`,
      /* File library (GET /api/files) + text preview + delete. `fetchRaw`
       * returns the authenticated raw response so callers can build a blob
       * URL (web) or stream it to a cache file (native); `rawUrl` is for
       * consumers that attach their own Authorization header (native Image /
       * FileSystem.downloadAsync). */
      list: (cursor?: string | null, limit = 50) =>
        request<{ files: StoredFile[]; nextCursor?: string | null }>(`/files?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
      preview: (id: string) => request<StoredFilePreview>(`/files/${encodeURIComponent(id)}/content`),
      remove: (id: string) => request<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      rawUrl: (id: string) => `${input.baseUrl}/files/${encodeURIComponent(id)}/raw`,
      fetchRaw: (id: string) => fetchWithAuth(`${input.baseUrl}/files/${encodeURIComponent(id)}/raw`),
    },
    providers: {
      /* Model providers (server-held keys — the client sends a key once
       * over TLS and thereafter only sees hasKey/keyHint). Activating one
       * deactivates the rest server-side; built-in rows are never deleted
       * from this client (they are the fallback when nothing is active). */
      list: async () => (await request<{ providers: ProviderKey[] }>('/api-key')).providers,
      create: (entry: { label?: string; url: string; model: string; key: string; isMultimodal?: boolean }) =>
        request<ProviderKey>('/api-key', { method: 'POST', body: JSON.stringify(entry) }),
      patch: (id: string, patch: Partial<Pick<ProviderKey, 'label' | 'url' | 'model' | 'isActive' | 'isMultimodal'>> & { key?: string }) =>
        request<ProviderKey>(`/api-key/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      remove: (id: string) => request<void>(`/api-key/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    chatUrl,
    readTokens,
  };
}

export async function readChatStream(response: Response, handlers: ChatSseHandlers) {
  if (!response.body) throw new ApiError(response.status, 'Stream unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let streamError: string | null = null;
  const tracked: ChatSseHandlers = {
    ...handlers,
    onDone: () => { complete = true; },
    onError: (message) => { streamError = message; },
  };
  try {
    while (!complete && !streamError) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeSseBuffer(buffer, (frame) => {
        if (!complete && !streamError) dispatchChatSseFrame(frame, tracked);
      });
    }
    buffer += decoder.decode();
    if (!complete && !streamError && buffer.trim()) dispatchChatSseFrame(buffer, tracked);
    if (streamError) throw new ApiError(502, streamError);
    if (!complete) throw new ApiError(502, 'Connection closed before the response finished. Please retry.');
    handlers.onDone?.();
  } finally {
    try { await reader.cancel(); } catch { /* reader may already be aborted */ }
    reader.releaseLock();
  }
}

export async function startChatStream(input: { url: string; request: ChatRequest; fetch: FetchLike; token?: string; handlers: ChatSseHandlers; signal?: AbortSignal }) {
  const response = await input.fetch(input.url, { method: 'POST', headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}) }, body: JSON.stringify(input.request), signal: input.signal });
  if (!response.ok) throw new ApiError(response.status, `Stream failed (${response.status})`);
  await readChatStream(response, input.handlers);
}
