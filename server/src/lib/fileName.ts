/**
 * Upload file-name handling.
 *
 * A file has two names and they never mix:
 *   - the storage key: `<uuid><.ext>` on disk, server-generated, ASCII only
 *     (see `safeStorageExtension`), so a user-chosen name can never become
 *     a path segment;
 *   - the display name: the user's own name, kept as clean NFC UTF-8 and
 *     stored in `files.name`. This is what the library lists, the download
 *     offers, and the model sees in read_attachment headers.
 *
 * Why the recovery step exists: busboy (under multer) decodes the
 * multipart `filename="…"` parameter as latin1 unless told otherwise.
 * Browsers send that parameter as raw UTF-8 bytes, so 「数学.pdf」 was
 * stored as 「æ\u0095°å\u00ad¦.pdf」. The upload routes now pass
 * `defParamCharset: 'utf8'`, and `repairLatin1Mojibake` re-decodes names
 * that were saved before the fix whenever they are read back.
 */

import path from 'node:path';

export const MAX_FILE_NAME_LENGTH = 255;

const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });

/* C0/C1 controls plus bidi embedding/override/isolate marks — the latter
   let a name like `invoice\u202Efdp.exe` render as `invoiceexe.pdf`. */
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Undo latin1-decoded UTF-8 ("æ\u0095°å\u00ad¦" → "数学").
 *
 * Only applied when it is unambiguous: every character fits in one byte
 * (a latin1 decode can produce nothing else), at least one is non-ASCII,
 * the bytes form valid UTF-8, and the result contains characters beyond
 * latin1 (CJK, kana, Hangul, Cyrillic, …). A genuine latin1 name such as
 * "café.pdf" is not valid UTF-8 as bytes, so it is returned unchanged.
 */
export function repairLatin1Mojibake(name: string): string {
  if (!name) return name;
  let hasHigh = false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c > 0xff) return name;
    if (c >= 0x80) hasHigh = true;
  }
  if (!hasHigh) return name;
  let decoded: string;
  try {
    decoded = UTF8_FATAL.decode(Buffer.from(name, 'latin1'));
  } catch {
    return name;
  }
  return /[^\u0000-\u00ff]/.test(decoded) ? decoded : name;
}

/** Keep the extension, shorten the stem, never split a surrogate pair. */
function truncateKeepingExtension(name: string, max: number): string {
  const chars = Array.from(name);
  if (chars.length <= max) return name;
  const ext = path.extname(name);
  const extChars = Array.from(ext);
  if (ext && extChars.length < 32 && extChars.length < max) {
    const stem = chars.slice(0, chars.length - extChars.length);
    return stem.slice(0, max - extChars.length).join('').trimEnd() + ext;
  }
  return chars.slice(0, max).join('');
}

/**
 * Clean a client-supplied file name into a display name.
 * Returns null when nothing usable remains.
 *
 * `overLength`: 'truncate' (uploads — a long Chinese title should still
 * keep its name) or 'reject' (renames — the user can fix it).
 */
export function normalizeFileName(raw: unknown, overLength: 'truncate' | 'reject' = 'truncate'): string | null {
  if (typeof raw !== 'string') return null;
  let name = repairLatin1Mojibake(raw).normalize('NFC');
  /* Display names are never a path: drop any directory part, POSIX or
     Windows (path.basename on Linux ignores backslashes). */
  name = name.split(/[\\/]/).pop() || '';
  name = name.replace(UNSAFE_NAME_CHARS, '').trim();
  if (!name || name === '.' || name === '..') return null;
  if (Array.from(name).length > MAX_FILE_NAME_LENGTH) {
    if (overLength === 'reject') return null;
    name = truncateKeepingExtension(name, MAX_FILE_NAME_LENGTH);
  }
  return name || null;
}

/** Display form of a stored name: repairs pre-fix mojibake, NFC. */
export function displayFileName(stored: unknown): string {
  const raw = typeof stored === 'string' ? stored : '';
  if (!raw) return 'file';
  return repairLatin1Mojibake(raw).normalize('NFC');
}

/** ASCII-only extension for the on-disk storage key ('' when unusual). */
export function safeStorageExtension(name: string): string {
  const ext = path.extname(String(name || '')).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : '';
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Content-Disposition value carrying a UTF-8 name (RFC 6266 / RFC 5987):
 * `filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded>`.
 * Modern browsers use filename*; the fallback keeps old clients working.
 */
export function contentDisposition(type: 'attachment' | 'inline', name: string): string {
  const display = displayFileName(name).replace(UNSAFE_NAME_CHARS, '');
  const ext = safeStorageExtension(display);
  let fallback = display.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  /* An all-CJK name collapses to underscores; give it a readable stem. */
  if (!/[A-Za-z0-9]/.test(fallback.slice(0, fallback.length - ext.length))) fallback = `file${ext}`;
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(display)}`;
}
