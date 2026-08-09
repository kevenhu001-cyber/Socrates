import * as SecureStore from 'expo-secure-store';

/**
 * Small persisted flags that are not part of the auth/session state. Kept out of
 * `appStore` because native modules read them synchronously (see `native.vibrate`)
 * and they survive sign-out.
 */
export interface Preferences {
  haptics: boolean;
  notifications: boolean;
}

const KEYS: Record<keyof Preferences, string> = {
  haptics: 'socrates.pref.haptics',
  notifications: 'socrates.pref.notifications',
};

const defaults: Preferences = { haptics: true, notifications: true };

let cache: Preferences = { ...defaults };
const listeners = new Set<() => void>();

/** Synchronous read of the last known value — safe before `loadPreferences`. */
export function getPreferences(): Preferences {
  return cache;
}

export function subscribeToPreferences(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hydrate from storage. Call once at startup; failures keep the defaults. */
export async function loadPreferences(): Promise<Preferences> {
  const next = { ...defaults };
  for (const key of Object.keys(KEYS) as Array<keyof Preferences>) {
    try {
      const stored = await SecureStore.getItemAsync(KEYS[key]);
      if (stored === 'true' || stored === 'false') next[key] = stored === 'true';
    } catch {
      // keep the default for this flag
    }
  }
  cache = next;
  listeners.forEach((listener) => listener());
  return cache;
}

export async function setPreference(key: keyof Preferences, value: boolean) {
  cache = { ...cache, [key]: value };
  listeners.forEach((listener) => listener());
  try {
    await SecureStore.setItemAsync(KEYS[key], String(value));
  } catch {
    // best effort; the in-memory value still applies for this session
  }
}
