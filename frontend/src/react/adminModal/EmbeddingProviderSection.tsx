import type { FormEvent } from 'react';

import type { EmbeddingProviderConfig } from './types';

interface EmbeddingProviderSectionProps {
  form: EmbeddingProviderConfig | null;
  apiKey: string;
  saving: boolean;
  onFormChange: (form: EmbeddingProviderConfig) => void;
  onApiKeyChange: (key: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}

export function EmbeddingProviderSection({
  form,
  apiKey,
  saving,
  onFormChange,
  onApiKeyChange,
  onSubmit,
  onRemove,
}: EmbeddingProviderSectionProps) {
  return (
    <section className="admin-section">
      <h3>Embedding provider (vector retrieval)</h3>
      <p className="admin-hint">
        Backs the session RAG hybrid search. Leave the key blank to keep
        the existing one. Remove the provider to degrade to BM25-only.
      </p>
      {!form ? (
        <button type="button" className="admin-save" onClick={() => onFormChange({
          id: '', label: 'Embedding', url: '', model: '',
          keyHint: null, dimensions: 1536, isActive: true, hasKey: false,
        })}>
          Configure embedding provider
        </button>
      ) : (
        <form onSubmit={onSubmit}>
          <label>
            Display name
            <input type="text" value={form.label}
              onChange={(event) => onFormChange({ ...form, label: event.target.value })}
              maxLength={200} required />
          </label>
          <label>
            OpenAI-compatible URL
            <input type="url" value={form.url}
              onChange={(event) => onFormChange({ ...form, url: event.target.value })}
              placeholder="https://api.openai.com/v1" maxLength={2048} required />
          </label>
          <label>
            Model ID
            <input type="text" value={form.model}
              onChange={(event) => onFormChange({ ...form, model: event.target.value })}
              placeholder="text-embedding-3-small" maxLength={200} required />
          </label>
          <label>
            Dimensions
            <input type="number" value={form.dimensions}
              onChange={(event) => onFormChange({
                ...form,
                dimensions: Number.parseInt(event.target.value, 10) || 1536,
              })}
              min={64} max={4096} required />
          </label>
          <label>
            API key {form.hasKey && <span className="admin-key-present">(configured{form.keyHint ? `: ${form.keyHint}…` : ''})</span>}
            <input type="password" value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={form.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
              autoComplete="off" />
          </label>
          <div className="admin-actions">
            <button type="submit" className="admin-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save embedding'}
            </button>
            {form.id && (
              <button type="button" className="admin-remove" onClick={onRemove} disabled={saving}>
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
