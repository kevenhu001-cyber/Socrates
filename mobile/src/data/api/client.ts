import type {
  ApiErrorBody,
  ChatRequest,
  EmbeddedTarget,
  MobileTokenPair,
  MobileWebSessionResponse,
  Project,
  ProjectConnector,
  KnowledgeNode,
  Memory,
  Mistake,
  ScheduledTask,
  Session,
  User,
} from '@socrates/contracts';
import { clearTokens, readTokens, writeCachedUser, writeTokens } from './tokenStore';
import { API_BASE_URL, AUTH_BASE_URL, WEB_BASE_URL } from './config';
import { shouldRefreshAfterUnauthorized } from './retryPolicy';

export { API_BASE_URL, AUTH_BASE_URL, WEB_BASE_URL } from './config';

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: ApiErrorBody | null;

  constructor(status: number, message: string, body?: ApiErrorBody | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

async function parseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return { message: text }; }
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
  const current = await readTokens();
  if (!current.refreshToken) return false;
  const response = await fetch(`${API_BASE_URL}/auth/mobile/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!response.ok) {
    await clearTokens();
    return false;
  }
  const tokens = await response.json() as MobileTokenPair;
  /* Keep the previous expiries if a server ever omits them, so a partial
   * refresh response cannot wipe the stored rotation horizon. */
  await writeTokens({
    ...tokens,
    refreshToken: tokens.refreshToken || current.refreshToken,
    expiresAt: tokens.expiresAt || current.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt || current.refreshExpiresAt,
  } as MobileTokenPair);
  return true;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const tokens = await readTokens();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokens.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : 'Network unavailable', { code: 'NETWORK' });
  }

  if (response.status === 401 && retry && shouldRefreshAfterUnauthorized(path)) {
    if (await refreshAccessToken()) return apiRequest<T>(path, init, false);
  }

  const body = await parseBody(response) as ApiErrorBody | T | null;
  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(response.status, errorBody?.message || errorBody?.detail || `HTTP ${response.status}`, errorBody);
  }
  return body as T;
}

export const authApi = {
  async login(email: string, password: string) {
    const result = await apiRequest<{ user: User } & MobileTokenPair>('/auth/mobile/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    await writeTokens(result);
    await writeCachedUser(result.user);
    return result.user;
  },
  async me() {
    const result = await apiRequest<{ user: User }>('/auth/me');
    await writeCachedUser(result.user);
    return result.user;
  },
  register(email: string, password: string) {
    return apiRequest<{ ok?: boolean; email?: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, false);
  },
  resendVerification(email: string) {
    return apiRequest<{ ok: boolean }>('/auth/resend-verification', {
      method: 'POST', body: JSON.stringify({ email }),
    }, false);
  },
  sendCode(email: string) {
    return apiRequest<{ ok: boolean }>('/auth/send-code', {
      method: 'POST', body: JSON.stringify({ email }),
    }, false);
  },
  async loginWithCode(email: string, code: string) {
    const result = await apiRequest<{ user: User } & MobileTokenPair>('/auth/mobile/login-with-code', {
      method: 'POST', body: JSON.stringify({ email, code }),
    }, false);
    await writeTokens(result);
    await writeCachedUser(result.user);
    return result.user;
  },
  forgotPassword(email: string) {
    return apiRequest<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }, false);
  },
  resetInfo(token: string) {
    return apiRequest<{ email?: string }>(`/auth/reset-info?token=${encodeURIComponent(token)}`, {}, false);
  },
  resetPassword(token: string, password: string) {
    return apiRequest<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, password }),
    }, false);
  },
  async verifyEmail(token: string) {
    const result = await apiRequest<{ user: User } & MobileTokenPair>(`/auth/mobile/verify?token=${encodeURIComponent(token)}`, {}, false);
    await writeTokens(result);
    await writeCachedUser(result.user);
    return result.user;
  },
  async oauthExchange(exchangeToken: string) {
    const tokens = await apiRequest<MobileTokenPair>('/auth/mobile/oauth/exchange', {
      method: 'POST', body: JSON.stringify({ exchangeToken }),
    }, false);
    await writeTokens(tokens);
    return this.me();
  },
  async logout() {
    const tokens = await readTokens();
    try {
      await apiRequest('/auth/mobile/logout', {
        method: 'POST', body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }, false);
    } finally {
      await clearTokens();
    }
  },
};

export const embeddedApi = {
  createSession: (target: EmbeddedTarget) => apiRequest<MobileWebSessionResponse>('/auth/mobile/web-session', {
    method: 'POST', body: JSON.stringify({ target }),
  }),
};

export const usersApi = {
  updateMe: (payload: Partial<Pick<User, 'displayName' | 'customInstructions' | 'preferences' | 'defaultModel'>>) => apiRequest<User>('/users/me', {
    method: 'PATCH', body: JSON.stringify(payload),
  }),
};

export const memoryApi = {
  list: () => apiRequest<{ memories: Memory[]; nextCursor?: string | null }>('/memory?limit=100&includeDisabled=true'),
  create: (text: string) => apiRequest<Memory>('/memory', { method: 'POST', body: JSON.stringify({ text, source: 'user' }) }),
  patch: (id: string, payload: Partial<Pick<Memory, 'text' | 'enabled'>>) => apiRequest<Memory>(`/memory/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  }),
  remove: (id: string) => apiRequest<void>(`/memory/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const sessionsApi = {
  list: () => apiRequest<{ sessions: Session[]; nextCursor?: string | null }>('/sessions?limit=50'),
  get: (id: string) => apiRequest<Session>(`/sessions/${encodeURIComponent(id)}`),
  upsert: (payload: Partial<Session> & { id?: string; messages?: Session['messages'] }) => apiRequest<Session>('/sessions', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  patch: (id: string, payload: Record<string, unknown>) => apiRequest<Session>(`/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  }),
  archive: (id: string) => apiRequest(`/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
  delete: (id: string) => apiRequest(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const projectsApi = {
  list: () => apiRequest<{ projects: Project[] }>('/projects'),
  create: (payload: Pick<Project, 'name'> & Partial<Pick<Project, 'description' | 'color' | 'icon' | 'systemPrompt'>>) => apiRequest<Project>('/projects', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  update: (id: string, payload: Partial<Pick<Project, 'name' | 'description' | 'color' | 'icon' | 'systemPrompt'>>) => apiRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  }),
  remove: (id: string) => apiRequest<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const scheduledApi = {
  list: () => apiRequest<{ tasks: ScheduledTask[] }>('/scheduled-tasks'),
  create: (payload: Pick<ScheduledTask, 'title' | 'prompt'> & Partial<Pick<ScheduledTask, 'sessionId' | 'cronExpression' | 'frequency' | 'nextRunAt'>>) => apiRequest<ScheduledTask>('/scheduled-tasks', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  update: (id: string, payload: Partial<Pick<ScheduledTask, 'title' | 'prompt' | 'sessionId' | 'cronExpression' | 'frequency' | 'status' | 'nextRunAt'>>) => apiRequest<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  }),
  run: (id: string) => apiRequest<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  remove: (id: string) => apiRequest<void>(`/scheduled-tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const projectConnectorsApi = {
  list: () => apiRequest<{ mode?: string; configured: boolean; connectors: ProjectConnector[] }>('/project-connectors'),
  connect: (id: string, body?: { apiKey?: string; values?: Record<string, string> }) => apiRequest<{ status?: string; requestId?: string; authorizationUrl?: string; expiresAt?: string; connectedAccountId?: string; displayName?: string | null }>(`/project-connectors/${encodeURIComponent(id)}/connect`, {
    method: 'POST', body: JSON.stringify(body || {}),
  }),
  status: (id: string) => apiRequest<{ connection: ProjectConnector['connection'] }>(`/project-connectors/${encodeURIComponent(id)}/status`),
};

export const knowledgeApi = {
  list: (status?: string) => apiRequest<{ items: KnowledgeNode[]; summary: Record<string, number> }>(`/knowledge-boundary${status ? `?status=${encodeURIComponent(status)}` : ''}`),
};

export const mistakesApi = {
  list: (resolved?: boolean) => apiRequest<{ items: Mistake[]; total: number }>(`/mistakes?limit=100${resolved === undefined ? '' : `&resolved=${resolved}`}`),
  resolve: (id: string, isResolved: boolean) => apiRequest<Mistake>(`/mistakes/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ isResolved }),
  }),
  remove: (id: string) => apiRequest<void>(`/mistakes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const messagesApi = {
  edit: (id: string, content: string, regenerate = false) => apiRequest(`/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ content, regenerate }),
  }),
  regenerate: (id: string) => apiRequest(`/messages/${encodeURIComponent(id)}/regenerate`, { method: 'POST' }),
  feedback: (id: string, rating: 'up' | 'down' | 'none', reason?: string) => apiRequest(`/messages/${encodeURIComponent(id)}/feedback`, {
    method: 'PUT', body: JSON.stringify({ rating, reason }),
  }),
};

export const sharesApi = {
  get: (sessionId: string) => apiRequest<{ token: string | null; url?: string; visibility: string }>(`/sessions/${encodeURIComponent(sessionId)}/share`),
  create: (sessionId: string) => apiRequest<{ token: string; url: string; visibility: string }>(`/sessions/${encodeURIComponent(sessionId)}/share`, {
    method: 'POST', body: JSON.stringify({ visibility: 'unlisted' }),
  }),
  absoluteUrl: (url: string) => new URL(url, `${WEB_BASE_URL}/`).toString(),
};

export interface MobileFileAsset {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

export const filesApi = {
  list: () => apiRequest<{ files: Array<Record<string, unknown>> }>('/files'),
  async upload(asset: MobileFileAsset, sessionId?: string) {
    if (asset.size && asset.size > 25 * 1024 * 1024) throw new ApiError(413, 'Files must be smaller than 25 MB', { code: 'PAYLOAD_TOO_LARGE' });
    const form = new FormData();
    form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as unknown as Blob);
    if (sessionId) form.append('sessionId', sessionId);
    return apiRequest<{ id: string; name: string; mimeType: string; size: number; kind: string }>('/files', { method: 'POST', body: form });
  },
  get: (id: string) => apiRequest<Record<string, unknown>>(`/files/${encodeURIComponent(id)}`),
  rename: (id: string, name: string) => apiRequest<{ id: string; name: string }>(`/files/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ name }),
  }),
  remove: (id: string) => apiRequest<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  content: (id: string) => apiRequest<{ ok: boolean; id: string; name: string; mimeType: string; kind: string; text: string; truncated: boolean; meta?: Record<string, unknown> }>(`/files/${encodeURIComponent(id)}/content`),
  rawUrl: (id: string) => `${API_BASE_URL}/files/${encodeURIComponent(id)}/raw`,
  async raw(id: string) {
    const tokens = await readTokens();
    const response = await fetch(filesApi.rawUrl(id), { headers: tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : undefined });
    if (!response.ok) throw new ApiError(response.status, `Unable to download file (${response.status})`);
    return response.blob();
  },
};

export const artifactsApi = {
  list: () => apiRequest<{ artifacts: Array<Record<string, unknown>> }>('/artifacts'),
  get: (id: string) => apiRequest<Record<string, unknown>>(`/artifacts/${encodeURIComponent(id)}`),
  rename: (id: string, title: string) => apiRequest<Record<string, unknown>>(`/artifacts/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ title }),
  }),
  remove: (id: string) => apiRequest<void>(`/artifacts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const searchApi = {
  query: (payload: Record<string, unknown>) => apiRequest<{ hits: Array<Record<string, unknown>> }>('/search', {
    method: 'POST', body: JSON.stringify(payload),
  }),
};

export const usageApi = {
  daily: (days: number) =>
    apiRequest<{ days?: Array<{ date: string; tokens: number; requests: number }>; total?: number }>(`/usage/daily?days=${days}`),
  limits: () => apiRequest<Record<string, unknown>>('/usage/limits'),
};

export const notificationsApi = {
  register: (token: string, deviceId?: string) => apiRequest('/notifications/register', {
    method: 'POST', body: JSON.stringify({ token, platform: 'android', deviceId, channels: ['long_tasks', 'replies', 'mentions'] }),
  }),
  unregister: () => apiRequest('/notifications/unregister', { method: 'DELETE' }),
};

export function chatStreamUrl(sessionId: string) {
  return `${API_BASE_URL}/chat/stream?sessionId=${encodeURIComponent(sessionId)}`;
}

export function serializeChatRequest(request: ChatRequest) {
  return JSON.stringify({ mode: 'chat', temperature: 0.7, max_tokens: 4096, ...request });
}
