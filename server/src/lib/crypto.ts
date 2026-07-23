import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

/**
 * Fail-fast on missing SESSION_SECRET in production.
 *
 * Without SESSION_SECRET the api_keys table is encrypted with a public
 * default key (`'dev-secret'`), letting anyone with the source code
 * decrypt every user's LLM provider key. The startup check in
 * src/index.js already exits the process, but importing this module
 * earlier (e.g. from a route loader) would silently use the weak
 * default. Surface that immediately so the misconfiguration is loud.
 */
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error(
    'FATAL: SESSION_SECRET is required in production (used to encrypt api_keys)'
  );
}

const BCRYPT_ROUNDS = 12;

/** Hash a plaintext password. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Compare a plaintext password against a bcrypt hash. */
export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Generate a session ID (128-bit URL-safe token). */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Generate a share token (192-bit URL-safe). */
export function generateShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Generate a verification / password-reset token (64-bit hex). */
export function generateShortToken(): string {
  return crypto.randomBytes(8).toString('hex');
}

// 30-char alphabet excluding 0/O/1/I/l → ~39 bits at 8 chars + authLimiter.
const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 8-char alphanumeric login code (replaces brute-forceable 6-digit). */
export function generateLoginCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += LOGIN_CODE_ALPHABET[crypto.randomInt(0, LOGIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Encrypt a plaintext string (e.g. an API key) with AES-256-GCM.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex).
 */
export function encrypt(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plain, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string produced by encrypt().
 */
export function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let plain = decipher.update(encrypted, 'hex', 'utf8');
  plain += decipher.final('utf8');
  return plain;
}

/**
 * Derive a 256-bit AES key from the SESSION_SECRET using HKDF.
 * HKDF is a proper KDF (RFC 5869) — preferable to bare SHA-256 for
 * key derivation because it provides domain separation and is
 * resistant to length-extension attacks.
 */
export function deriveEncryptionKey(secret: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.from('socrates-key-v1'),
      Buffer.from('aes-256-gcm'),
      32,
    ),
  );
}
