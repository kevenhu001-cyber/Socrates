/**
 * AdminPage — the /admin operator console (a main-content page, not
 * a modal).
 *
 * Auth: independent ADMIN_PASSWORD credential (server-side
 * services/adminAuth.ts). The token is kept in sessionStorage so a
 * refresh of /admin survives without a re-login (session-scoped,
 * cleared when the tab closes). The httpOnly cookie set by
 * /api/admin-auth/login covers the XHR path as a fallback.
 */

import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type FormEvent } from 'react';

import { installAdminBridge, useAdminSnapshot } from './admin.bridge';
import { publishAdminSnapshot } from './legacyApi';
import type { EmbeddingProviderConfig, SystemModelConfig } from './types';

const ADMIN_AUTH_API = '/api/admin-auth';
const ADMIN_API = '/api/system-models';
const EMBEDDING_API = '/api/embedding-config';
const TOKEN_KEY = 'socrates_admin_token';

function storedToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
}
function storeToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch (_) { /* ignore */ }
}
function clearToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) { /* ignore */ }
}

function authHeaders(): Record<string, string> {
  const token = storedToken();
  return token ? { 'X-Admin-Token': token } : {};
}

function LoginPage({ onReady }: { onReady: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.message || 'Incorrect admin password.');
        return;
      }
      storeToken(payload.token || '');
      onReady();
    } catch (err) {
      setError((err as Error).message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login">
      <h2>Admin console</h2>
      <p className="admin-hint">Enter the operator password to manage the system model and embedding provider.</p>
      <form onSubmit={submit}>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && <div className="admin-error" role="alert">{error}</div>}
        <button type="submit" className="admin-save" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function AdminPage() {
  const snap = useAdminSnapshot();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [systemForm, setSystemForm] = useState<SystemModelConfig | null>(null);
  const [systemKey, setSystemKey] = useState('');
  const [embeddingForm, setEmbeddingForm] = useState<EmbeddingProviderConfig | null>(null);
  const [embeddingKey, setEmbeddingKey] = useState('');

  /* Verify the stored token on mount, then load the config. */
  useEffect(() => {
    void (async () => {
      try {
        const statusRes = await fetch(`${ADMIN_AUTH_API}/status`, { credentials: 'same-origin' });
        const status = await statusRes.json().catch(() => ({ configured: false }));
        if (!status.configured) {
          publishAdminSnapshot({
            open: true, loading: false, error: null,
            systemModel: null, embedding: null,
            isAdmin: false,
            adminGateError: 'ADMIN_PASSWORD is not set on the server — the admin console is disabled.',
          });
          setAuthed(false);
          return;
        }
        if (storedToken()) {
          const verifyRes = await fetch(`${ADMIN_AUTH_API}/verify`, {
            headers: authHeaders(),
            credentials: 'same-origin',
          });
          const verify = await verifyRes.json().catch(() => ({ valid: false }));
          setAuthed(!!verify.valid);
          if (verify.valid) return;
          clearToken();
        }
        setAuthed(false);
      } catch (_) {
        setAuthed(false);
      }
    })();
  }, []);

  const loadConfig = async () => {
    publishAdminSnapshot({ open: true, loading: true, error: null });
    try {
      const [sysRes, embRes] = await Promise.all([
        fetch(ADMIN_API, { headers: authHeaders(), credentials: 'same-origin' }),
        fetch(EMBEDDING_API, { headers: authHeaders(), credentials: 'same-origin' }),
      ]);
      if (sysRes.status === 403 || embRes.status === 403) {
        clearToken();
        setAuthed(false);
        return;
      }
      const sysRow = sysRes.ok ? await sysRes.json() : null;
      const embRow = embRes.ok ? await embRes.json() : null;
      setSystemForm(sysRow);
      setEmbeddingForm(Array.isArray(embRow) ? embRow[0] ?? null : embRow);
      publishAdminSnapshot({
        open: true, loading: false, error: null,
        systemModel: sysRow, embedding: Array.isArray(embRow) ? embRow[0] ?? null : embRow,
        isAdmin: true, adminGateError: null,
      });
    } catch (err) {
      publishAdminSnapshot({
        open: true, loading: false, error: (err as Error).message,
        systemModel: null, embedding: null,
        isAdmin: false, adminGateError: null,
      });
    }
  };

  useEffect(() => {
    if (authed) void loadConfig();
  }, [authed]);

  if (authed === null) {
    return <div className="admin-loading">Loading…</div>;
  }
  if (!authed) {
    return <LoginPage onReady={() => setAuthed(true)} />;
  }

  const submitSystem = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!systemForm) return;
    publishAdminSnapshot({ ...snap, savingSystem: true, error: null });
    try {
      const body: Record<string, unknown> = {
        label: systemForm.label,
        url: systemForm.url,
        model: systemForm.model,
        isMultimodal: systemForm.isMultimodal,
      };
      if (systemKey) body.key = systemKey;
      const res = await fetch(ADMIN_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ message: 'Save failed' }));
        throw new Error(detail.message || 'Save failed');
      }
      const saved = await res.json();
      setSystemForm(saved);
      setSystemKey('');
      publishAdminSnapshot({ ...snap, savingSystem: false, systemModel: saved, error: null });
    } catch (err) {
      publishAdminSnapshot({ ...snap, savingSystem: false, error: (err as Error).message });
    }
  };

  const submitEmbedding = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!embeddingForm) {
      setEmbeddingForm({
        id: '', label: 'Embedding', url: '', model: '',
        keyHint: null, dimensions: 1536, isActive: true, hasKey: false,
      });
      return;
    }
    publishAdminSnapshot({ ...snap, savingEmbedding: true, error: null });
    try {
      const body: Record<string, unknown> = {
        label: embeddingForm.label,
        url: embeddingForm.url,
        model: embeddingForm.model,
        dimensions: embeddingForm.dimensions,
      };
      if (embeddingKey) body.key = embeddingKey;
      const res = await fetch(EMBEDDING_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ message: 'Save failed' }));
        throw new Error(detail.message || 'Save failed');
      }
      const saved = await res.json();
      setEmbeddingForm(saved);
      setEmbeddingKey('');
      publishAdminSnapshot({ ...snap, savingEmbedding: false, embedding: saved, error: null });
    } catch (err) {
      publishAdminSnapshot({ ...snap, savingEmbedding: false, error: (err as Error).message });
    }
  };

  const clearEmbedding = async () => {
    if (!embeddingForm?.id) return;
    publishAdminSnapshot({ ...snap, savingEmbedding: true, error: null });
    try {
      const res = await fetch(`${EMBEDDING_API}/${embeddingForm.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ message: 'Delete failed' }));
        throw new Error(detail.message || 'Delete failed');
      }
      setEmbeddingForm(null);
      setEmbeddingKey('');
      publishAdminSnapshot({ ...snap, savingEmbedding: false, embedding: null, error: null });
    } catch (err) {
      publishAdminSnapshot({ ...snap, savingEmbedding: false, error: (err as Error).message });
    }
  };

  const signOut = async () => {
    try { await fetch(`${ADMIN_AUTH_API}/logout`, { method: 'POST', credentials: 'same-origin' }); } catch (_) { /* ignore */ }
    clearToken();
    setAuthed(false);
  };

  return (
    <div className="admin-console">
      <div className="admin-console-head">
        <h2>Admin console</h2>
        <button type="button" className="admin-remove" onClick={signOut}>Sign out</button>
      </div>
      {snap.loading && <div className="admin-loading">Loading…</div>}
      {snap.error && <div className="admin-error" role="alert">{snap.error}</div>}
      <div className="admin-body">
        <section className="admin-section">
          <h3>System model (built-in / Beagle)</h3>
          <p className="admin-hint">
            The LLM anonymous visitors and users without their own key use.
            Leave the key blank to keep the existing one.
          </p>
          {systemForm && (
            <form onSubmit={submitSystem}>
              <label>
                Display name
                <input type="text" value={systemForm.label}
                  onChange={(e) => setSystemForm({ ...systemForm, label: e.target.value })}
                  maxLength={200} required />
              </label>
              <label>
                OpenAI-compatible URL
                <input type="url" value={systemForm.url}
                  onChange={(e) => setSystemForm({ ...systemForm, url: e.target.value })}
                  placeholder="https://api.minimax.io/v1" maxLength={2048} required />
              </label>
              <label>
                Model ID
                <input type="text" value={systemForm.model}
                  onChange={(e) => setSystemForm({ ...systemForm, model: e.target.value })}
                  placeholder="MiniMax-M3" maxLength={200} required />
              </label>
              <label>
                API key {systemForm.hasKey && <span className="admin-key-present">(configured{systemForm.keyHint ? `: ${systemForm.keyHint}…` : ''})</span>}
                <input type="password" value={systemKey}
                  onChange={(e) => setSystemKey(e.target.value)}
                  placeholder={systemForm.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
                  autoComplete="off" />
              </label>
              <label className="admin-checkbox">
                <input type="checkbox" checked={systemForm.isMultimodal}
                  onChange={(e) => setSystemForm({ ...systemForm, isMultimodal: e.target.checked })} />
                Accepts images (multimodal)
              </label>
              <button type="submit" className="admin-save" disabled={snap.savingSystem}>
                {snap.savingSystem ? 'Saving…' : 'Save system model'}
              </button>
            </form>
          )}
          {!systemForm && <p className="admin-empty">Not configured yet — fill the form and save.</p>}
        </section>

        <section className="admin-section">
          <h3>Embedding provider (vector retrieval)</h3>
          <p className="admin-hint">
            Backs the session RAG hybrid search. Leave the key blank to keep
            the existing one. Remove the provider to degrade to BM25-only.
          </p>
          {!embeddingForm && (
            <button type="button" className="admin-save"
              onClick={() => setEmbeddingForm({
                id: '', label: 'Embedding', url: '', model: '',
                keyHint: null, dimensions: 1536, isActive: true, hasKey: false,
              })}>
              Configure embedding provider
            </button>
          )}
          {embeddingForm && (
            <form onSubmit={submitEmbedding}>
              <label>
                Display name
                <input type="text" value={embeddingForm.label}
                  onChange={(e) => setEmbeddingForm({ ...embeddingForm, label: e.target.value })}
                  maxLength={200} required />
              </label>
              <label>
                OpenAI-compatible URL
                <input type="url" value={embeddingForm.url}
                  onChange={(e) => setEmbeddingForm({ ...embeddingForm, url: e.target.value })}
                  placeholder="https://api.openai.com/v1" maxLength={2048} required />
              </label>
              <label>
                Model ID
                <input type="text" value={embeddingForm.model}
                  onChange={(e) => setEmbeddingForm({ ...embeddingForm, model: e.target.value })}
                  placeholder="text-embedding-3-small" maxLength={200} required />
              </label>
              <label>
                Dimensions
                <input type="number" value={embeddingForm.dimensions}
                  onChange={(e) => setEmbeddingForm({
                    ...embeddingForm,
                    dimensions: Number.parseInt(e.target.value, 10) || 1536,
                  })}
                  min={64} max={4096} required />
              </label>
              <label>
                API key {embeddingForm.hasKey && <span className="admin-key-present">(configured{embeddingForm.keyHint ? `: ${embeddingForm.keyHint}…` : ''})</span>}
                <input type="password" value={embeddingKey}
                  onChange={(e) => setEmbeddingKey(e.target.value)}
                  placeholder={embeddingForm.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
                  autoComplete="off" />
              </label>
              <div className="admin-actions">
                <button type="submit" className="admin-save" disabled={snap.savingEmbedding}>
                  {snap.savingEmbedding ? 'Saving…' : 'Save embedding'}
                </button>
                {embeddingForm.id && (
                  <button type="button" className="admin-remove" onClick={clearEmbedding} disabled={snap.savingEmbedding}>
                    Remove
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

let root: Root | null = null;

export function mountAdminPage(): void {
  const container = document.getElementById('adminPanelBody');
  if (!container) return;

  installAdminBridge();

  if (!root) {
    root = createRoot(container);
  }
  root.render(<AdminPage />);
}

export function unmountAdminPage(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
