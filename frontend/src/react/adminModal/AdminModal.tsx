/**
 * AdminModal — admin surface for the system model (the built-in
 * Beagle path) and the embedding provider config.
 *
 * The legacy openAdminModal helper publishes the open state; the
 * React component fetches the two config endpoints (which are
 * admin-gated server-side — a non-admin gets 403 and the modal
 * renders the gate error instead of the forms).
 */

import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type FormEvent } from 'react';

import { installAdminBridge, useAdminSnapshot } from './admin.bridge';
import { publishAdminSnapshot, closeAdminModal } from './legacyApi';
import type { EmbeddingProviderConfig, SystemModelConfig } from './types';

const ADMIN_API = '/api/system-models';
const EMBEDDING_API = '/api/embedding-config';

/* Double-submit CSRF half — see AdminPage.tsx#csrfHeaders. The modal
   issues the same mutating admin requests and needs the same echo. */
function csrfHeaders(): Record<string, string> {
  try {
    const m = document.cookie.match(/\bcsrf=([^;]+)/);
    return m ? { 'X-CSRF-Token': m[1] } : {};
  } catch (_) { return {}; }
}

function AdminModal() {
  const snap = useAdminSnapshot();
  const [systemForm, setSystemForm] = useState<SystemModelConfig | null>(null);
  const [systemKey, setSystemKey] = useState('');
  const [embeddingForm, setEmbeddingForm] = useState<EmbeddingProviderConfig | null>(null);
  const [embeddingKey, setEmbeddingKey] = useState('');

  useEffect(() => {
    if (!snap.open) return;
    void (async () => {
      publishAdminSnapshot({ open: true, loading: true, error: null });
      try {
        const [sysRes, embRes] = await Promise.all([
          fetch(ADMIN_API, { credentials: 'same-origin' }),
          fetch(EMBEDDING_API, { credentials: 'same-origin' }),
        ]);
        if (sysRes.status === 403 || embRes.status === 403) {
          const detail = await sysRes.json().catch(() => ({ message: 'Admin access required' }));
          publishAdminSnapshot({
            open: true, loading: false, error: null,
            systemModel: null, embedding: null,
            isAdmin: false,
            adminGateError: detail.message || 'Admin access required',
          });
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
    })();
  }, [snap.open]);

  if (!snap.open) return null;

  const close = () => {
    closeAdminModal();
  };

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
      if (systemForm.keyHint) body.keyHint = systemForm.keyHint;
      const res = await fetch(ADMIN_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
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
      /* The admin is configuring the first embedding provider. */
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
      if (embeddingForm.keyHint) body.keyHint = embeddingForm.keyHint;
      const res = await fetch(EMBEDDING_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
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
        headers: csrfHeaders(),
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

  return (
    <div className="modal-overlay admin-modal-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) close(); }}>
      <div className="modal-card admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
        <div className="modal-head">
          <h2 id="adminModalTitle">Admin configuration</h2>
          <button type="button" className="modal-close" onClick={close} aria-label="Close admin configuration">
            ×
          </button>
        </div>
        {snap.loading && <div className="admin-loading">Loading…</div>}
        {!snap.loading && snap.adminGateError && (
          <div className="admin-gate-error" role="alert">
            {snap.adminGateError}
          </div>
        )}
        {!snap.loading && snap.error && (
          <div className="admin-error" role="alert">
            {snap.error}
          </div>
        )}
        {!snap.loading && snap.isAdmin && (
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
                    <input
                      type="text"
                      value={systemForm.label}
                      onChange={(e) => setSystemForm({ ...systemForm, label: e.target.value })}
                      maxLength={200}
                      required
                    />
                  </label>
                  <label>
                    OpenAI-compatible URL
                    <input
                      type="url"
                      value={systemForm.url}
                      onChange={(e) => setSystemForm({ ...systemForm, url: e.target.value })}
                      placeholder="https://api.minimax.io/v1"
                      maxLength={2048}
                      required
                    />
                  </label>
                  <label>
                    Model ID
                    <input
                      type="text"
                      value={systemForm.model}
                      onChange={(e) => setSystemForm({ ...systemForm, model: e.target.value })}
                      placeholder="MiniMax-M3"
                      maxLength={200}
                      required
                    />
                  </label>
                  <label>
                    API key {systemForm.hasKey && <span className="admin-key-present">(configured{systemForm.keyHint ? `: ${systemForm.keyHint}…` : ''})</span>}
                    <input
                      type="password"
                      value={systemKey}
                      onChange={(e) => setSystemKey(e.target.value)}
                      placeholder={systemForm.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
                      autoComplete="off"
                    />
                  </label>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={systemForm.isMultimodal}
                      onChange={(e) => setSystemForm({ ...systemForm, isMultimodal: e.target.checked })}
                    />
                    Accepts images (multimodal)
                  </label>
                  <button type="submit" className="admin-save" disabled={snap.savingSystem}>
                    {snap.savingSystem ? 'Saving…' : 'Save system model'}
                  </button>
                </form>
              )}
              {!systemForm && (
                <p className="admin-empty">Not configured yet — fill the form and save.</p>
              )}
            </section>

            <section className="admin-section">
              <h3>Embedding provider (vector retrieval)</h3>
              <p className="admin-hint">
                Backs the session RAG hybrid search. Leave blank to keep the
                existing key. Remove the provider to degrade to BM25-only.
              </p>
              {!embeddingForm && (
                <button
                  type="button"
                  className="admin-save"
                  onClick={() => setEmbeddingForm({
                    id: '', label: 'Embedding', url: '', model: '',
                    keyHint: null, dimensions: 1536, isActive: true, hasKey: false,
                  })}
                >
                  Configure embedding provider
                </button>
              )}
              {embeddingForm && (
                <form onSubmit={submitEmbedding}>
                  <label>
                    Display name
                    <input
                      type="text"
                      value={embeddingForm.label}
                      onChange={(e) => setEmbeddingForm({ ...embeddingForm, label: e.target.value })}
                      maxLength={200}
                      required
                    />
                  </label>
                  <label>
                    OpenAI-compatible URL
                    <input
                      type="url"
                      value={embeddingForm.url}
                      onChange={(e) => setEmbeddingForm({ ...embeddingForm, url: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      maxLength={2048}
                      required
                    />
                  </label>
                  <label>
                    Model ID
                    <input
                      type="text"
                      value={embeddingForm.model}
                      onChange={(e) => setEmbeddingForm({ ...embeddingForm, model: e.target.value })}
                      placeholder="text-embedding-3-small"
                      maxLength={200}
                      required
                    />
                  </label>
                  <label>
                    Dimensions
                    <input
                      type="number"
                      value={embeddingForm.dimensions}
                      onChange={(e) => setEmbeddingForm({
                        ...embeddingForm,
                        dimensions: Number.parseInt(e.target.value, 10) || 1536,
                      })}
                      min={64}
                      max={4096}
                      required
                    />
                  </label>
                  <label>
                    API key {embeddingForm.hasKey && <span className="admin-key-present">(configured{embeddingForm.keyHint ? `: ${embeddingForm.keyHint}…` : ''})</span>}
                    <input
                      type="password"
                      value={embeddingKey}
                      onChange={(e) => setEmbeddingKey(e.target.value)}
                      placeholder={embeddingForm.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
                      autoComplete="off"
                    />
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
        )}
      </div>
    </div>
  );
}

let root: Root | null = null;

export function mountAdminModal(): void {
  const container = document.getElementById('adminModal');
  if (!container) return;

  installAdminBridge();

  if (!root) {
    root = createRoot(container);
  }
  root.render(<AdminModal />);
}

export function unmountAdminModal(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
