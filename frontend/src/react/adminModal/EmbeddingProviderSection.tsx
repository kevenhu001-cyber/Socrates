import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Button as UiButton } from '../ui/Button';
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
        <UiButton type="button" className="admin-save" onClick={() => onFormChange({
          id: '', label: 'Embedding', url: '', model: '',
          keyHint: null, dimensions: 1536, isActive: true, hasKey: false,
        })}>
          Configure embedding provider
        </UiButton>
      ) : (
        <form onSubmit={onSubmit}>
          <ShadcnLabel>
            Display name
            <ShadcnInput type="text" value={form.label}
              onChange={(event) => onFormChange({ ...form, label: event.target.value })}
              maxLength={200} required />
          </ShadcnLabel>
          <ShadcnLabel>
            OpenAI-compatible URL
            <ShadcnInput type="url" value={form.url}
              onChange={(event) => onFormChange({ ...form, url: event.target.value })}
              placeholder="https://api.openai.com/v1" maxLength={2048} required />
          </ShadcnLabel>
          <ShadcnLabel>
            Model ID
            <ShadcnInput type="text" value={form.model}
              onChange={(event) => onFormChange({ ...form, model: event.target.value })}
              placeholder="text-embedding-3-small" maxLength={200} required />
          </ShadcnLabel>
          <ShadcnLabel>
            Dimensions
            <ShadcnInput type="number" value={form.dimensions}
              onChange={(event) => onFormChange({
                ...form,
                dimensions: Number.parseInt(event.target.value, 10) || 1536,
              })}
              min={64} max={4096} required />
          </ShadcnLabel>
          <ShadcnLabel>
            API key {form.hasKey && <span className="admin-key-present">(configured{form.keyHint ? `: ${form.keyHint}…` : ''})</span>}
            <ShadcnInput type="password" value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={form.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
              autoComplete="off" />
          </ShadcnLabel>
          <div className="admin-actions">
            <UiButton type="submit" className="admin-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save embedding'}
            </UiButton>
            {form.id && (
              <UiButton type="button" className="admin-remove" onClick={onRemove} disabled={saving}>
                Remove
              </UiButton>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
