import { isNativeRuntime, secureGet, secureRemove, secureSet } from '../native/services.js';

const TOKEN_KEY = 'socrates.mobile.token-pair';

export function isNativeAuth() {
  return isNativeRuntime();
}

export async function readMobileTokens() {
  if (!isNativeRuntime()) return null;
  const raw = await secureGet(TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : '',
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : '',
      refreshExpiresAt: typeof parsed.refreshExpiresAt === 'string' ? parsed.refreshExpiresAt : '',
    };
  } catch (_) {
    return null;
  }
}

export async function writeMobileTokens(tokens) {
  if (!isNativeRuntime() || !tokens) return;
  await secureSet(TOKEN_KEY, JSON.stringify({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
  }));
}

export async function clearMobileTokens() {
  if (!isNativeRuntime()) return;
  await secureRemove(TOKEN_KEY);
}

