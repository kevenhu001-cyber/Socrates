import { Field, FieldGroup, FieldLabel } from '../ui/shadcn/field';
import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Checkbox } from '../ui/shadcn/checkbox';
import { Button as UiButton } from '../ui/shadcn/button';
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
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="admin-systemmodelsection-1">Display name</FieldLabel>
              <ShadcnInput id="admin-systemmodelsection-1" type="text" value={form.label}
                onChange={(event) => onFormChange({ ...form, label: event.target.value })}
                maxLength={200} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-systemmodelsection-2">OpenAI-compatible URL</FieldLabel>
              <ShadcnInput id="admin-systemmodelsection-2" type="url" value={form.url}
                onChange={(event) => onFormChange({ ...form, url: event.target.value })}
                placeholder="https://api.minimax.io/v1" maxLength={2048} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-systemmodelsection-3">Model ID</FieldLabel>
              <ShadcnInput id="admin-systemmodelsection-3" type="text" value={form.model}
                onChange={(event) => onFormChange({ ...form, model: event.target.value })}
                placeholder="MiniMax-M3" maxLength={200} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-systemmodelsection-4">API key {form.hasKey && <span className="admin-key-present">(configured{form.keyHint ? `: ${form.keyHint}…` : ''})</span>}</FieldLabel>
              <ShadcnInput id="admin-systemmodelsection-4" type="password" value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                placeholder={form.hasKey ? 'Leave blank to keep' : 'Paste the provider key'}
                autoComplete="off" />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="admin-system-multimodal" checked={form.isMultimodal}
                onCheckedChange={(checked) => onFormChange({ ...form, isMultimodal: checked })} />
              <FieldLabel htmlFor="admin-system-multimodal">Accepts images (multimodal)</FieldLabel>
            </Field>
            <UiButton variant="default" type="submit" className="admin-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save system model'}
            </UiButton>
          </FieldGroup>
        </form>
      ) : (
        <p className="admin-empty">Not configured yet — fill the form and save.</p>
      )}
    </section>
  );
}
