import { apiFetch } from '../util/api.js';
import { showToast } from '../ui/toast.js';
import {
  getProviderConfigSnapshot,
  publishProviderConfig,
  resetProviderConfig,
  subscribeToProviderConfig,
} from './providerConfig.store.ts';
import type {
  ProviderConfig,
  ProviderConfigErrors,
  ProviderConfigSnapshot,
  ProviderErrorField,
  ProviderField,
  ProviderFieldValue,
  ProviderSaveResult,
} from './providerConfig.types.ts';

declare global {
  interface Window {
    CURRENT_USER?: { tier?: string } | null;
    SERVER_HAS_BEAGLE_KEY?: boolean;
    TIER_KEY_LIMITS?: Record<string, number>;
  }
}

export const LAST_ACTIVE_ID_KEY = 'socrates-last-active-id';
const BUILT_IN_ID = 'beagle-built-in';
const BUILT_IN_BASE: ProviderConfig = Object.freeze({
  id: BUILT_IN_ID,
  label: 'Beagle',
  url: '/api/minimax/v1',
  model: '',
  vision: true,
  isBuiltIn: true,
  hasKey: true,
});

/* Input credentials live only in this service closure. Provider snapshots and
   React subscriptions carry the configured flag, never plaintext keys. */
const credentialDrafts = new Map<string, string>();
let builtInModel = '';

export { getProviderConfigSnapshot, subscribeToProviderConfig };

export function saveLastActiveId(id: string | null | undefined): void {
  try {
    if (!id || id === 'null' || id === 'undefined') localStorage.removeItem(LAST_ACTIVE_ID_KEY);
    else localStorage.setItem(LAST_ACTIVE_ID_KEY, String(id));
  } catch {
    /* Storage is optional; the in-memory selection remains authoritative. */
  }
}

export function loadLastActiveId(): string | null {
  try {
    const value = localStorage.getItem(LAST_ACTIVE_ID_KEY);
    return value && value !== 'null' && value !== 'undefined' ? value : null;
  } catch {
    return null;
  }
}

export function setBuiltInProviderModel(model: string | null | undefined): void {
  if (typeof model === 'string' && model.trim()) builtInModel = model.trim();
  const current = getProviderConfigSnapshot();
  const providers = current.providers.map((provider) => provider.id === BUILT_IN_ID
    ? { ...provider, model: builtInModel }
    : provider);
  publishProviderConfig({ providers });
}

export function resetProviderConfigForUser(): void {
  credentialDrafts.clear();
  resetProviderConfig();
}

function normalizeProvider(row: Record<string, unknown>): ProviderConfig {
  const id = String(row.id || '');
  return {
    id,
    label: String(row.label || '').trim(),
    url: String(row.url || ''),
    model: String(row.model || '').trim(),
    vision: row.vision === true || row.isMultimodal === true,
    isBuiltIn: row.isBuiltIn === true || id === BUILT_IN_ID,
    hasKey: row.hasKey === true || Boolean(row.key),
    serverIsActive: row.isActive === true,
  };
}

function publishSelectionAndProviders(providers: readonly ProviderConfig[], activeId: string | null, fetched = true): void {
  publishProviderConfig({ providers, activeId, fetched });
}

export async function refreshProviderConfig(): Promise<ProviderConfigSnapshot> {
  if (!window.CURRENT_USER) {
    credentialDrafts.clear();
    publishSelectionAndProviders([], null);
    return getProviderConfigSnapshot();
  }

  try {
    const result = await apiFetch('/api/api-key');
    const rows = Array.isArray(result?.providers)
      ? (result.providers as Record<string, unknown>[]).map(normalizeProvider)
      : [];
    const serverBuiltIn = rows.find((provider) => provider.id === BUILT_IN_ID);
    if (serverBuiltIn?.model) builtInModel = serverBuiltIn.model;
    const customProviders = rows.filter((provider) => provider.id !== BUILT_IN_ID);
    const hasBuiltIn = Boolean(window.SERVER_HAS_BEAGLE_KEY);
    const builtIn: ProviderConfig = { ...BUILT_IN_BASE, model: builtInModel, hasKey: hasBuiltIn };
    const lastId = loadLastActiveId();
    let activeId: string | null = null;

    // Preserve selection precedence: local preference, server active row,
    // configured Beagle, then first user-configured provider.
    if (lastId === BUILT_IN_ID && hasBuiltIn) activeId = lastId;
    else if (lastId && customProviders.some((provider) => provider.id === lastId)) activeId = lastId;
    if (!activeId) activeId = customProviders.find((provider) => provider.serverIsActive)?.id || null;
    if (!activeId && hasBuiltIn) activeId = BUILT_IN_ID;
    if (!activeId && customProviders.length) activeId = customProviders[0].id;

    const providers = hasBuiltIn ? [builtIn, ...customProviders] : customProviders;
    credentialDrafts.clear();
    publishSelectionAndProviders(providers, activeId);
    return getProviderConfigSnapshot();
  } catch {
    credentialDrafts.clear();
    publishSelectionAndProviders([], null);
    return getProviderConfigSnapshot();
  }
}

function clearProviderError(id: string, field?: ProviderErrorField): void {
  const errors = { ...getProviderConfigSnapshot().errors };
  if (!field) delete errors[id];
  else if (errors[id]) {
    const next = { ...errors[id] };
    delete next[field];
    if (Object.keys(next).length) errors[id] = next;
    else delete errors[id];
  }
  publishProviderConfig({ errors });
}

export function updateProviderField(id: string, field: ProviderField, value: ProviderFieldValue): void {
  const state = getProviderConfigSnapshot();
  const provider = state.providers.find((item) => item.id === id);
  if (!provider) return;

  if (field === 'key') {
    const key = String(value);
    if (key === '') credentialDrafts.delete(id);
    else credentialDrafts.set(id, key);
  } else {
    const providers = state.providers.map((item) => item.id !== id ? item : {
      ...item,
      [field]: field === 'vision' ? Boolean(value) : String(value),
    });
    publishProviderConfig({ providers });
  }
  if (field !== 'vision' && field !== 'key') clearProviderError(id, field);
  if (field === 'key') clearProviderError(id, 'key');
}

export function addProvider(): string | null {
  const user = window.CURRENT_USER as { tier?: string } | null;
  const limits = window.TIER_KEY_LIMITS || {};
  const limit = limits[user?.tier || 'diophantus'] || 2;
  const current = getProviderConfigSnapshot();
  const custom = current.providers.filter((provider) => !provider.isBuiltIn);
  if (custom.length >= limit) {
    showToast(`API provider limit reached (${limit}) for your plan.`);
    return null;
  }
  const id = `new-${Date.now().toString(36)}`;
  publishProviderConfig({
    providers: [...current.providers, {
      id, label: '', url: '', model: '', vision: false, isBuiltIn: false, hasKey: false,
    }],
  });
  return id;
}

export async function removeProvider(id: string): Promise<boolean> {
  if (!id.startsWith('new-')) {
    try {
      await apiFetch(`/api/api-key/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'server error';
      showToast(`Failed to remove provider: ${message}. Try again.`);
      return false;
    }
  }
  credentialDrafts.delete(id);
  const state = getProviderConfigSnapshot();
  const providers = state.providers.filter((provider) => provider.id !== id);
  publishSelectionAndProviders(providers, state.activeId === id ? null : state.activeId);
  clearProviderError(id);
  return true;
}

export async function setActiveProvider(id: string): Promise<void> {
  const state = getProviderConfigSnapshot();
  const previous = state.activeId;
  if (!state.providers.some((provider) => provider.id === id)) return;
  publishProviderConfig({ activeId: id });
  saveLastActiveId(id);

  if (id === BUILT_IN_ID) {
    if (previous && previous !== BUILT_IN_ID) {
      try { await apiFetch(`/api/api-key/${encodeURIComponent(previous)}`, { method: 'PATCH', body: { isActive: false } }); }
      catch { /* non-critical; next refresh reconciles the server flag */ }
    }
    return;
  }

  try {
    await apiFetch(`/api/api-key/${encodeURIComponent(id)}`, { method: 'PATCH', body: { isActive: true } });
  } catch {
    publishProviderConfig({ activeId: previous });
    saveLastActiveId(previous);
    showToast('Failed to activate provider on server. Changes reverted.');
  }
}

function validateUrl(value: string): string | null {
  if (!value.trim()) return null;
  if (!/^https?:\/\//i.test(value.trim())) return 'URL must start with http:// or https://';
  try { new URL(value.trim()); return null; } catch { return 'Invalid URL format'; }
}

function collectErrors(providers: readonly ProviderConfig[]): ProviderConfigErrors {
  const errors: ProviderConfigErrors = {};
  providers.forEach((provider) => {
    const providerErrors: Partial<Record<ProviderErrorField, string>> = {};
    const urlError = validateUrl(provider.url);
    if (urlError) providerErrors.url = `${urlError} for "${provider.label || provider.model || provider.id}"`;
    const key = credentialDrafts.get(provider.id) || '';
    if (key.trim() && key.trim().length < 8) {
      providerErrors.key = `Key is too short (min 8 characters) for "${provider.label || provider.model || provider.id}"`;
    }
    if (Object.keys(providerErrors).length) errors[provider.id] = providerErrors;
  });
  return errors;
}

export function setSaving(saving: boolean): void {
  publishProviderConfig({ saving });
}

async function persistProvider(provider: ProviderConfig): Promise<{ originalId: string; id: string; label: string }> {
  const key = credentialDrafts.get(provider.id) || '';
  if (provider.id.startsWith('new-')) {
    const response = await apiFetch('/api/api-key', {
      method: 'POST',
      body: {
        label: provider.label || '', url: provider.url || '', key,
        model: provider.model || '', isMultimodal: provider.vision,
      },
    });
    const id = response?.id ? String(response.id) : provider.id;
    return { originalId: provider.id, id, label: provider.label || provider.model || id };
  }
  const update: Record<string, unknown> = {
    label: provider.label, url: provider.url, model: provider.model, isMultimodal: provider.vision,
  };
  if (key.trim()) update.key = key;
  await apiFetch(`/api/api-key/${encodeURIComponent(provider.id)}`, { method: 'PATCH', body: update });
  return { originalId: provider.id, id: provider.id, label: provider.label || provider.model || provider.id };
}

export async function saveProviderConfig(): Promise<ProviderSaveResult> {
  const state = getProviderConfigSnapshot();
  if (state.saving) return { savedIds: [], failedIds: [] };
  const rows = state.providers.filter((provider) => !provider.isBuiltIn);
  if (!rows.length) {
    showToast(state.providers.some((provider) => provider.isBuiltIn)
      ? 'Built-in AI is already active.'
      : 'Add at least one provider');
    return { savedIds: [], failedIds: [] };
  }

  const validationErrors = collectErrors(rows);
  const invalidIds = Object.keys(validationErrors);
  if (invalidIds.length) {
    publishProviderConfig({ errors: validationErrors });
    showToast('Please fix the highlighted errors before saving.');
    return { savedIds: [], failedIds: invalidIds };
  }

  publishProviderConfig({ errors: {}, saving: true });
  const lastSuccessful: { value: { originalId: string; id: string; label: string } | null } = { value: null };
  const settled = await Promise.allSettled(rows.map(async (provider) => {
    const result = await persistProvider(provider);
    lastSuccessful.value = result;
    return result;
  }));
  const saved: Array<{ originalId: string; id: string; label: string }> = [];
  const failedIds: string[] = [];
  let lastError: unknown = null;
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') saved.push(result.value);
    else { failedIds.push(rows[index].id); lastError = result.reason; }
  });

  const current = getProviderConfigSnapshot();
  const idMap = new Map(saved.map((item) => [item.originalId, item.id]));
  const nextProviders = current.providers.map((provider) => {
    const id = idMap.get(provider.id);
    return id ? { ...provider, id, hasKey: provider.hasKey || Boolean(credentialDrafts.get(provider.id)) } : provider;
  });
  saved.forEach((item) => {
    const key = credentialDrafts.get(item.originalId);
    credentialDrafts.delete(item.originalId);
    if (key) credentialDrafts.delete(item.id);
  });
  const nextActiveId = lastSuccessful.value?.id || null;
  publishProviderConfig({
    providers: nextProviders,
    activeId: nextActiveId,
    saving: false,
  });
  saveLastActiveId(nextActiveId);

  const savedIds = saved.map((item) => item.originalId);
  const result = { savedIds, failedIds };
  if (failedIds.length && saved.length) {
    const message = lastError instanceof Error ? lastError.message : 'unknown error';
    showToast(`Saved ${saved.length} provider(s), but ${failedIds.length} failed: ${message}. Try saving again.`);
  } else if (failedIds.length) {
    showToast(`Save failed: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
  } else if (nextActiveId) {
    const activeLabel = lastSuccessful.value?.label || nextActiveId;
    showToast(`Saved — ${activeLabel}`);
  }
  return result;
}

export async function clearProviderConfig(): Promise<void> {
  if (!window.CURRENT_USER) return;
  const state = getProviderConfigSnapshot();
  const savedProviders = state.providers.filter((provider) => !provider.isBuiltIn && !provider.id.startsWith('new-'));
  await Promise.all(savedProviders.map((provider) => apiFetch(`/api/api-key/${encodeURIComponent(provider.id)}`, { method: 'DELETE' }).catch(() => undefined)));
  credentialDrafts.clear();
  try { localStorage.removeItem('socrates-provider-keys'); } catch { /* legacy preference may not exist */ }
  saveLastActiveId(null);
  const hasBuiltIn = Boolean(window.SERVER_HAS_BEAGLE_KEY);
  publishSelectionAndProviders(hasBuiltIn ? [{ ...BUILT_IN_BASE, model: builtInModel }] : [], null);
}

export function getActiveProvider(): ProviderConfig | null {
  const state = getProviderConfigSnapshot();
  return state.providers.find((provider) => provider.id === state.activeId) || null;
}

export function setActiveProviderLocal(id: string | null): void {
  publishProviderConfig({ activeId: id });
}

export type { ProviderConfig, ProviderConfigSnapshot, ProviderField, ProviderFieldValue, ProviderErrorField, ProviderSaveResult };
