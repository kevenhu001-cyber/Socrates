import { createStore } from 'zustand/vanilla';

import type { ComposerExtensionToken, ComposerSurface } from './types';

export interface ComposerLifecycleSnapshot {
  surface: ComposerSurface;
  drafts: Readonly<Record<ComposerSurface, string>>;
  extensionTokens: Readonly<Record<ComposerSurface, ComposerExtensionToken | null>>;
  revision: number;
}

const INITIAL: ComposerLifecycleSnapshot = Object.freeze({
  surface: 'topic',
  drafts: Object.freeze({ topic: '', chat: '' }),
  extensionTokens: Object.freeze({ topic: null, chat: null }),
  revision: 0,
});

const internalStore = createStore<ComposerLifecycleSnapshot>(() => INITIAL);

export const composerLifecycleStore = Object.freeze({
  getState: internalStore.getState,
  getInitialState: internalStore.getInitialState,
  subscribe: internalStore.subscribe,
});

function publish(patch: Partial<Omit<ComposerLifecycleSnapshot, 'revision'>>): void {
  const current = internalStore.getState();
  internalStore.setState(Object.freeze({
    ...current,
    ...patch,
    drafts: Object.freeze({ ...current.drafts, ...patch.drafts }),
    extensionTokens: Object.freeze({ ...current.extensionTokens, ...patch.extensionTokens }),
    revision: current.revision + 1,
  }), true);
}

export function writeComposerDraft(surface: ComposerSurface, value: string): void {
  const current = internalStore.getState();
  if (current.drafts[surface] === value) return;
  publish({ drafts: { ...current.drafts, [surface]: value } });
}

export function writeComposerExtensionToken(surface: ComposerSurface, token: ComposerExtensionToken | null): void {
  const current = internalStore.getState();
  const previous = current.extensionTokens[surface];
  if (previous === token || (previous && token && previous.key === token.key
    && previous.title === token.title && previous.icon === token.icon && previous.hint === token.hint)) return;
  publish({ extensionTokens: { ...current.extensionTokens, [surface]: token ? { ...token } : null } });
}

export function writeComposerSurface(surface: ComposerSurface): void {
  if (internalStore.getState().surface === surface) return;
  publish({ surface });
}

export function resetComposerLifecycleState(): void {
  const current = internalStore.getState();
  internalStore.setState(Object.freeze({ ...INITIAL, revision: current.revision + 1 }), true);
}
