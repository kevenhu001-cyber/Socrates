/**
 * MiniMax vision service — wraps the local `mmx` CLI for image
 * recognition (image → text description).
 *
 * Why a CLI wrapper: the project's MiniMax credential is centralized
 * in `~/.mmx/config.json` (set up via `mmx auth login`). Calling
 * `mmx vision describe` keeps quota + auth on the same surface as
 * `mmx search query` and `mmx quota`, instead of splitting across a
 * second env-var key.
 *
 * Limits / caveats:
 *   - The CLI takes a local file path or HTTP URL. For browser
 *     dataUrl uploads we write to a temp file (auto-cleaned).
 *   - Max image size is bounded by disk + the upstream API's own
 *     limits (a few MB). We cap input at 8 MB to keep the temp
 *     filesystem sane.
 *   - Spawning a Node CLI costs ~150-300 ms of startup; acceptable
 *     for user-initiated image uploads, not for tight loops.
 */

import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { isMmxCliAvailable, runMmx } from '../../lib/spawnMmx.js';

const MAX_BYTES = 8 * 1024 * 1024;          // 8 MB
const REQUEST_TIMEOUT = 30_000;             // VLM calls are slower than text
const IMAGE_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'image/heic', 'image/avif', 'image/bmp',
]);

/* `data:image/png;base64,…` → { mimeType, buffer }
   Returns `null` on malformed input. The caller (describeImage)
   distinguishes between a true malformed-dataUrl (400) and a
   decodeURIComponent failure on the URL-encoded branch (also 400)
   via separate error subclasses below. */
function parseDataUrl(dataUrl?: string) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const mimeType = m[1]!.toLowerCase();
  const isBase64 = !!m[2];
  const payload = m[3];
  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return isValidImagePayload(mimeType, buffer) ? { mimeType, buffer } : null;
  } catch (_) {
    return null;
  }
}

function extForMime(mimeType: string) {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
  };
  return map[(mimeType || '').toLowerCase()] || 'bin';
}

/** Check the declared raster type against its actual file signature. */
export function isValidImagePayload(mimeType: string, buffer: Buffer): boolean {
  const mime = String(mimeType || '').toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mime) || buffer.length < 8) return false;
  switch (mime) {
    case 'image/png':
      return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/jpeg':
    case 'image/jpg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/webp':
      return buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'image/gif':
      return buffer.toString('ascii', 0, 6) === 'GIF87a'
        || buffer.toString('ascii', 0, 6) === 'GIF89a';
    case 'image/bmp':
      return buffer.toString('ascii', 0, 2) === 'BM';
    case 'image/heic':
      return hasIsoBmffBrand(buffer, ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
    case 'image/avif':
      return hasIsoBmffBrand(buffer, ['avif', 'avis']);
    default:
      return false;
  }
}

function hasIsoBmffBrand(buffer: Buffer, allowed: readonly string[]): boolean {
  if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  if (allowed.includes(buffer.toString('ascii', 8, 12))) return true;
  for (let offset = 16; offset + 4 <= buffer.length; offset += 4) {
    if (allowed.includes(buffer.toString('ascii', offset, offset + 4))) return true;
  }
  return false;
}

function reject(status: number, message: string) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

/**
 * Describe an uploaded image via MiniMax vision.
 *
 * @param {object} input
 * @param {string} input.dataUrl   data: URL (image/png;base64,…) from the browser.
 * @param {string} [input.prompt]  Optional question about the image. Defaults
 *                                 to "Describe the image in detail."
 * @returns {Promise<{description: string, model: string, latencyMs: number}>}
 */
export async function describeImage({ dataUrl, prompt }: { dataUrl?: string; prompt?: string } = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw reject(400, 'dataUrl is required');
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw reject(400, 'Invalid dataUrl');
  }
  if (parsed.buffer.length === 0) {
    throw reject(400, 'Empty image payload');
  }
  if (parsed.buffer.length > MAX_BYTES) {
    throw reject(413, `Image too large (${parsed.buffer.length} > ${MAX_BYTES} bytes)`);
  }

  /* Private scratch directory: mkdtemp hands back a 0700 directory owned
     by this process, so the uploaded image never lands at a predictable
     path inside a world-writable /tmp where another local user could
     plant or read it. */
  const tmpDir = await mkdtemp(nodePath.join(tmpdir(), 'mmx-vision-'));
  const tmpPath = nodePath.join(tmpDir, `image.${extForMime(parsed.mimeType)}`);
  // lgtm[js/http-to-file-access] -- A validated raster image is intentionally staged in a private 0700 directory and 0600 file for the local vision CLI.
  await writeFile(tmpPath, parsed.buffer, { mode: 0o600 });

  /* Atomic cleanup — the temp file MUST be unlinked on every exit
     path (success, mmx failure, parse failure, syntax error, OOM,
     etc.). A plain try/catch after the call would leak the temp file
     on any unexpected throw. finally guarantees cleanup runs even
     when callers re-throw or the process exits via an unhandled
     rejection. unlink failures are swallowed because the temp dir
     is OS-managed (Linux: `tmpwatch`/`systemd-tmpfiles`, macOS:
     reboot cleanup). */
  try {
    return await describeImageFile({ path: tmpPath, prompt });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Describe an image already on disk (e.g. a persisted /api/files upload)
 * via MiniMax vision. Used by the read_attachment tool so a text-only
 * model can still "see" an image the user attached — the file stays a
 * real attachment; the model asks for the description on demand instead
 * of receiving a pre-baked text dump in the prompt.
 *
 * @param {object} input
 * @param {string} input.path    Absolute path to the image file.
 * @param {string} [input.prompt]  Optional question about the image.
 * @returns {Promise<{description: string, model: string, latencyMs: number}>}
 */
export async function describeImageFile({ path, prompt }: { path?: string; prompt?: string } = {}) {
  if (!path || typeof path !== 'string') {
    throw reject(400, 'path is required');
  }
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) {
    throw reject(400, 'Empty image payload');
  }
  if (info.size > MAX_BYTES) {
    throw reject(413, `Image too large (${info.size} > ${MAX_BYTES} bytes)`);
  }
  /* Fail fast with a meaningful error rather than letting spawn throw
     a raw ENOENT when the mmx CLI is not installed. */
  if (!isMmxCliAvailable()) {
    throw reject(503, 'Vision backend unavailable: mmx CLI is not installed');
  }

  const start = Date.now();
  const stdout = await runMmx(
    ['vision', 'describe', '--image', path, '--output', 'json', '--quiet',
      ...(prompt ? ['--prompt', prompt] : [])],
    { timeoutMs: REQUEST_TIMEOUT },
  );

  let data;
  try { data = JSON.parse(stdout as string); }
  catch (_) {
    throw reject(502, 'mmx returned non-JSON output');
  }

  const baseResp = data?.base_resp || data?.baseResp;
  if (baseResp && String(baseResp.status_code) !== '0') {
    throw reject(502, baseResp.status_msg || `minimax vision error ${baseResp.status_code}`);
  }

  const description = (data?.content || '').trim();
  if (!description) {
    throw reject(502, 'Vision returned empty description');
  }

  return {
    description,
    model: 'minimax-vision',
    latencyMs: Date.now() - start,
  };
}
