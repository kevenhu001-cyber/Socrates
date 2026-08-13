import type { MobileTokenPair, User } from '@socrates/contracts';
import { deleteItem, getItem, setItem } from '../../platform/secureStorage';

const ACCESS_KEY = 'socrates.mobile.access-token';
const REFRESH_KEY = 'socrates.mobile.refresh-token';
const EXPIRY_KEY = 'socrates.mobile.access-expiry';
const USER_KEY = 'socrates.mobile.cached-user';
const DEVICE_ID_KEY = 'socrates.mobile.device-id';

export async function readTokens(): Promise<Partial<MobileTokenPair>> {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    getItem(ACCESS_KEY),
    getItem(REFRESH_KEY),
    getItem(EXPIRY_KEY),
  ]);
  return { accessToken: accessToken || undefined, refreshToken: refreshToken || undefined, expiresAt: expiresAt || undefined };
}

export async function writeTokens(tokens: MobileTokenPair) {
  await Promise.all([
    setItem(ACCESS_KEY, tokens.accessToken),
    setItem(REFRESH_KEY, tokens.refreshToken),
    setItem(EXPIRY_KEY, tokens.expiresAt),
  ]);
}

export async function readCachedUser(): Promise<User | null> {
  try {
    const raw = await getItem(USER_KEY);
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
}

export async function writeCachedUser(user: User) {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function clearTokens() {
  await Promise.all([
    deleteItem(ACCESS_KEY),
    deleteItem(REFRESH_KEY),
    deleteItem(EXPIRY_KEY),
    deleteItem(USER_KEY),
  ]);
}

export async function readDeviceId() {
  const existing = await getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await setItem(DEVICE_ID_KEY, generated);
  return generated;
}
