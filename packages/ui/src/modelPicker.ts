/* modelPicker — DOM-free provider list model for the chat-header model
 * switcher. Ports the item semantics of `frontend/src/modelPicker.js`:
 * built-in rows sort first, the active row carries the check, and the
 * menu always ends with a Manage entry that leads to the providers
 * screen. Activation itself stays in the host app (PATCH /api-key with
 * the epoch-guarded mirror update); this module only shapes the list. */

import type { ProviderKey } from '@socrates/contracts';

/** Built-in rows first, otherwise stable. Mirrors the web baseline. */
export function sortProvidersBuiltInFirst(providers: ProviderKey[]): ProviderKey[] {
  return [...providers].sort((a, b) => Number(!!b.isBuiltIn) - Number(!!a.isBuiltIn));
}

export function activeProviderOf(providers: ProviderKey[]): ProviderKey | null {
  return providers.find((p) => p.isActive) || null;
}

export interface ProviderRowLabel {
  name: string;
  sub: string;
}

/** Name + sub-line exactly like the baseline item: the model when it
 * differs from the name, else the URL for custom rows, else nothing. */
export function providerRowLabel(provider: ProviderKey): ProviderRowLabel {
  const name = provider.label || provider.model || 'Item';
  const model = provider.model || '';
  const sub = model && model !== name ? model : (!provider.isBuiltIn ? (provider.url || '') : '');
  return { name, sub };
}

/** Case-insensitive label/model/url filter for the picker's search box
 * (baseline shows it once there are 4+ rows). */
export function filterProviders(providers: ProviderKey[], query: string): ProviderKey[] {
  const q = query.trim().toLowerCase();
  if (!q) return providers;
  return providers.filter((p) =>
    `${p.label || ''} ${p.model || ''} ${p.url || ''}`.toLowerCase().includes(q),
  );
}
