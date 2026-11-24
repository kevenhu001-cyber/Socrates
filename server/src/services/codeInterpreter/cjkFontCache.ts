/**
 * On-disk cache for the CJK font that Pyodide's matplotlib needs.
 *
 * This module is deliberately pyodide-free so the parent process can warm
 * the cache at boot (`boot/startup.ts`). The download used to happen inline
 * on the first matplotlib run inside the worker, where an 8 s fetch sat on
 * the execution's critical path and counted against the user's own timeout.
 * Fetching at boot leaves only the local read + SHA-1 validation on that
 * path.
 *
 * The font is pinned by URL, exact byte length and Git blob SHA-1, staged in
 * a private mkdtemp directory and renamed into place so a symlink planted at
 * the predictable cache path cannot redirect the write.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sanitizeLogValue } from '../../lib/logRedaction.js';

export const CJK_FONT_HOST_DIR =
  process.env.EXEC_CJK_FONT_DIR ||
  path.join(
    process.env.NODE_ENV === 'production' ? '/var/lib/socrates' : os.tmpdir(),
    'socrates-cjk-fonts',
  );
const CJK_FONT_FILENAME = 'NotoSansSC-Regular.otf';
const CJK_FONT_URL =
  'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf';
/* Exact Git object metadata for the font at the pinned URL. */
const CJK_FONT_EXPECTED_BYTES = 8_331_336;
const CJK_FONT_GIT_BLOB_SHA1 = 'fc0fda9394367c16c1af7555a2ae4d5e2e6a6f02';
const CJK_FONT_MIN_BYTES = 100_000;
const CJK_FONT_MAX_BYTES = 24 * 1024 * 1024;
const CJK_FONT_TIMEOUT_MS = parseInt(process.env.EXEC_CJK_FONT_TIMEOUT_MS || '8000', 10);

export function cjkFontPath(): string {
  return path.join(CJK_FONT_HOST_DIR, CJK_FONT_FILENAME);
}

export function isCjkFontPayload(bytes: Buffer): boolean {
  if (
    bytes.length !== CJK_FONT_EXPECTED_BYTES ||
    bytes.length < CJK_FONT_MIN_BYTES ||
    bytes.length > CJK_FONT_MAX_BYTES ||
    (bytes.toString('ascii', 0, 4) !== 'OTTO' &&
      !bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])))
  )
    return false;
  const gitObject = crypto
    .createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  return gitObject === CJK_FONT_GIT_BLOB_SHA1;
}

async function readBoundedFontResponse(response: Response): Promise<Buffer | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CJK_FONT_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

/**
 * Return the path of a validated font file, downloading it once when the
 * cache is empty. Returns null when the cache is unusable; callers fall back
 * to matplotlib's DejaVu Sans, which renders CJK as tofu but still charts.
 */
export async function ensureCjkFontCached(): Promise<string | null> {
  const target = cjkFontPath();
  try {
    /* Establish private ownership before inspecting a cache entry; in
       development this path is below the shared OS temp directory. */
    await fs.mkdir(CJK_FONT_HOST_DIR, { recursive: true, mode: 0o700 });
    const dirInfo = await fs.lstat(CJK_FONT_HOST_DIR);
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) {
      throw new Error('CJK font cache must be a real directory');
    }
    await fs.chmod(CJK_FONT_HOST_DIR, 0o700);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[pyodide] CJK font cache directory unavailable: ${sanitizeLogValue(detail, 160)}`,
    );
    return null;
  }
  try {
    const st = await fs.lstat(target);
    if (
      st.isFile() &&
      !st.isSymbolicLink() &&
      st.size >= CJK_FONT_MIN_BYTES &&
      st.size <= CJK_FONT_MAX_BYTES
    ) {
      const cached = await fs.readFile(target);
      if (isCjkFontPayload(cached)) {
        await fs.chmod(target, 0o600);
        return target;
      }
    }
  } catch (_) {
    /* empty-catch: intentional — no validated cache entry yet; the download path below is the normal flow */
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CJK_FONT_TIMEOUT_MS);
  try {
    const resp = await fetch(CJK_FONT_URL, { signal: controller.signal, redirect: 'error' });
    if (!resp.ok || !resp.body) {
      console.warn(`[pyodide] CJK font download returned HTTP ${resp.status}`);
      return null;
    }
    const contentLength = Number(resp.headers.get('content-length'));
    if (
      Number.isFinite(contentLength) &&
      contentLength > 0 &&
      (contentLength < CJK_FONT_MIN_BYTES || contentLength > CJK_FONT_MAX_BYTES)
    ) {
      await resp.body.cancel();
      console.warn('[pyodide] CJK font download size is outside the accepted range');
      return null;
    }
    const buf = await readBoundedFontResponse(resp);
    if (!buf || !isCjkFontPayload(buf)) {
      console.warn('[pyodide] CJK font download failed size or font-signature validation');
      return null;
    }
    /* Stage the download inside a private mkdtemp directory and rename it
       into place. Writing straight to the cache path would follow a
       symlink planted at that predictable /tmp location; rename replaces
       the link itself instead of its target. */
    const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-cjk-'));
    const stagingPath = path.join(stagingDir, 'font.otf');
    try {
      // lgtm[js/http-to-file-access] -- This pinned font is size-, signature-, and Git-blob-verified before private staging.
      await fs.writeFile(stagingPath, buf, { mode: 0o600 });
      await fs.rename(stagingPath, target);
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
    console.log(
      `[pyodide] Cached CJK font (${(buf.length / 1024 / 1024).toFixed(1)} MB) at ${target}`,
    );
    return target;
  } catch (err) {
    console.warn(`[pyodide] CJK font download failed: ${(err && (err as Error).message) || err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
