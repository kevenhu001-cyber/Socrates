import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

/** Hash a plaintext password. */
export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Compare a plaintext password against a bcrypt hash. */
export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Generate a session ID (128-bit URL-safe token). */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Generate a share token (192-bit URL-safe). */
export function generateShareToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/** Generate a verification / password-reset token (64-bit hex). */
export function generateShortToken() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Encrypt a plaintext string (e.g. an API key) with AES-256-GCM.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex).
 */
export function encrypt(plain, key) {
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
export function decrypt(payload, key) {
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
 * Derive a 256-bit AES key from the SESSION_SECRET.
 */
export function deriveEncryptionKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}
