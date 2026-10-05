import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { createStore } from 'zustand/vanilla';

import type {
  ProviderConfig,
  ProviderConfigErrors,
  ProviderConfigSnapshot,
} from './providerConfig.types.ts';

const INITIAL: ProviderConfigSnapshot = Object.freeze({
  providers: Object.freeze([]),
  activeId: null,
  fetched: false,
  saving: false,
  errors: Object.freeze({}),
  revision: 0,
});

const internalStore = createStore<ProviderConfigSnapshot>(() => INITIAL);

function freezeProviders(providers: readonly ProviderConfig[]): readonly ProviderConfig[] {
  return Object.freeze(providers.map((provider) => Object.freeze({ ...provider })));
}

function freezeErrors(errors: ProviderConfigErrors): ProviderConfigErrors {
  const copy: ProviderConfigErrors = {};
  Object.entries(errors).forEach(([id, fields]) => {
    copy[id] = Object.freeze({ ...fields });
  });
  return Object.freeze(copy);
}

/** Read-only public store surface; writes are restricted to named domain actions below. */
export const providerConfigStore = Object.freeze({
  getState: internalStore.getState,
  getInitialState: internalStore.getInitialState,
  subscribe: internalStore.subscribe,
});

export function getProviderConfigSnapshot(): ProviderConfigSnapshot {
  return providerConfigStore.getState();
}

export function subscribeToProviderConfig(listener: () => void): () => void {
  return providerConfigStore.subscribe(listener);
}

export function useProviderConfigStore<T>(selector: (snapshot: ProviderConfigSnapshot) => T): T {
  return useStoreWithEqualityFn(providerConfigStore, selector, shallow);
}

export function publishProviderConfig(patch: Partial<Omit<ProviderConfigSnapshot, 'revision'>>): void {
  const current = internalStore.getState();
  const next: ProviderConfigSnapshot = Object.freeze({
    ...current,
    ...patch,
    providers: freezeProviders(patch.providers ?? current.providers),
    errors: freezeErrors(patch.errors ?? current.errors),
    revision: current.revision + 1,
  });
  internalStore.setState(next, true);
}

export function resetProviderConfig(): void {
  const current = internalStore.getState();
  internalStore.setState(Object.freeze({ ...INITIAL, revision: current.revision + 1 }), true);
}
