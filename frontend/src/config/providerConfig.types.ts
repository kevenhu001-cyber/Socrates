import type { ProviderCapabilities } from '@socrates/contracts';

export type ProviderField = 'label' | 'url' | 'model' | 'vision' | 'key' | 'instantEncoding';
export type ProviderErrorField = Exclude<ProviderField, 'vision' | 'instantEncoding'>;

/** The encodings the server accepts as a per-provider "no thinking" override. */
export const INSTANT_ENCODING_OPTIONS = [
  'reasoning_effort_none',
  'thinking_disabled',
  'enable_thinking_false',
  'chat_template_kwargs',
] as const;

export type InstantEncoding = (typeof INSTANT_ENCODING_OPTIONS)[number];

/** Provider metadata shared by settings and model consumers. Credentials are never part of this type. */
export interface ProviderConfig {
  id: string;
  label: string;
  url: string;
  model: string;
  vision: boolean;
  isBuiltIn: boolean;
  hasKey: boolean;
  serverIsActive?: boolean;
  /* P_provider-capability-override — the operator's own statement of how
     their endpoint encodes "no thinking". `null` means "let the server's
     capability registry decide". */
  instantEncoding: InstantEncoding | null;
  /* P_model-capability-registry — what the server knows the model can do.
     Absent means "not published": the browser then forwards the user's
     intent and lets the server resolve it, as it did before. */
  capabilities?: ProviderCapabilities;
}

export interface ProviderConfigErrors {
  [id: string]: Partial<Record<ProviderErrorField, string>>;
}

export interface ProviderConfigSnapshot {
  providers: readonly ProviderConfig[];
  activeId: string | null;
  fetched: boolean;
  saving: boolean;
  errors: ProviderConfigErrors;
  revision: number;
}

export type ProviderFieldValue = string | boolean;

export interface ProviderSaveResult {
  savedIds: string[];
  failedIds: string[];
}
