import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { Input as ShadcnInput } from '../ui/shadcn/input';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Button as UiButton } from '../ui/Button';
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
              placeholder="https://api.minimax.io/v1" maxLength={2048} required />
          </ShadcnLabel>
          <ShadcnLabel>
            Model ID
            <ShadcnInput type="text" value={form.model}
              onChange={(event) => onFormChange({ ...form, model: event.target.value })}
              placeholder="MiniMax-M3" maxLength={200} required />
          </ShadcnLabel>
          <ShadcnLabel>
            API key {form.hasKey && <span className="admin-key-present">(configured{form.keyHint ? `: ${form.keyHint}…` : ''})</span>}
            <ShadcnInput type="password" value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={form.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
              autoComplete="off" />
          </ShadcnLabel>
          <ShadcnLabel className="admin-checkbox">
            <ShadcnNativeControl type="checkbox" checked={form.isMultimodal}
              onChange={(event) => onFormChange({ ...form, isMultimodal: event.target.checked })} />
            Accepts images (multimodal)
          </ShadcnLabel>
          <UiButton type="submit" className="admin-save" disabled={saving}>
            {saving ? 'Saving…' : 'Save system model'}
          </UiButton>
        </form>
      ) : (
        <p className="admin-empty">Not configured yet — fill the form and save.</p>
      )}
    </section>
  );
}
