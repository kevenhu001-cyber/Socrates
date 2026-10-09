import type { FormEvent } from 'react';

import type { SystemModelConfig } from './types';

interface SystemModelSectionProps {
  form: SystemModelConfig | null;
  apiKey: string;
  saving: boolean;
  onFormChange: (form: SystemModelConfig) => void;
  onApiKeyChange: (key: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SystemModelSection({
  form,
  apiKey,
  saving,
  onFormChange,
  onApiKeyChange,
  onSubmit,
}: SystemModelSectionProps) {
  return (
    <section className="admin-section">
      <h3>System model (built-in / Beagle)</h3>
      <p className="admin-hint">
        The LLM anonymous visitors and users without their own key use.
        Leave the key blank to keep the existing one.
      </p>
      {form ? (
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
              placeholder="https://api.minimax.io/v1" maxLength={2048} required />
          </label>
          <label>
            Model ID
            <input type="text" value={form.model}
              onChange={(event) => onFormChange({ ...form, model: event.target.value })}
              placeholder="MiniMax-M3" maxLength={200} required />
          </label>
          <label>
            API key {form.hasKey && <span className="admin-key-present">(configured{form.keyHint ? `: ${form.keyHint}…` : ''})</span>}
            <input type="password" value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={form.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
              autoComplete="off" />
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={form.isMultimodal}
              onChange={(event) => onFormChange({ ...form, isMultimodal: event.target.checked })} />
            Accepts images (multimodal)
          </label>
          <button type="submit" className="admin-save" disabled={saving}>
            {saving ? 'Saving…' : 'Save system model'}
          </button>
        </form>
      ) : (
        <p className="admin-empty">Not configured yet — fill the form and save.</p>
      )}
    </section>
  );
}
