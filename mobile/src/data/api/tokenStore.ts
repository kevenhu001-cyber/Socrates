import * as SecureStore from 'expo-secure-store';
import type { MobileTokenPair, User } from '@socrates/contracts';

const ACCESS_KEY = 'socrates.mobile.access-token';
const REFRESH_KEY = 'socrates.mobile.refresh-token';
const EXPIRY_KEY = 'socrates.mobile.access-expiry';
const USER_KEY = 'socrates.mobile.cached-user';
const DEVICE_ID_KEY = 'socrates.mobile.device-id';

export async function readTokens(): Promise<Partial<MobileTokenPair>> {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(EXPIRY_KEY),
  ]);
  return { accessToken: accessToken || undefined, refreshToken: refreshToken || undefined, expiresAt: expiresAt || undefined };
}

export async function writeTokens(tokens: MobileTokenPair) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
    SecureStore.setItemAsync(EXPIRY_KEY, tokens.expiresAt),
  ]);
}

export async function readCachedUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
}

export async function writeCachedUser(user: User) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(EXPIRY_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

export async function readDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}
