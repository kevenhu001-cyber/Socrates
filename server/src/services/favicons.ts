import net from 'node:net';
import { ApiError, BadRequest } from '../lib/errors.js';
import { createPinnedAgent, resolveAndPin } from '../lib/publicHttp.js';
import { createRemoteCache } from './intelligentUiRemote.js';

const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 2;
const TIMEOUT_MS = 4_000;
const USER_AGENT = 'Socrates/1.0 (+https://topodrive.top; favicon)';
const ACCEPT = 'image/avif,image/webp,image/png,image/x-icon,image/vnd.microsoft.icon,image/*;q=0.8';

export interface Favicon {
  bytes: Buffer;
  type: string;
}

export interface FaviconDeps {
  fetchImpl?: typeof fetch;
  resolve?: typeof resolveAndPin;
}

const rejected = () => new BadRequest('Only public http(s) site URLs are allowed');
const unavailable = () => new ApiError(502, 'FAVICON_UNAVAILABLE', 'The site icon could not be loaded');
const notFound = () => new ApiError(404, 'FAVICON_NOT_FOUND', 'The site has no usable icon');

/**
 * Validate a URL that the proxy will contact. Hosts are resolved and pinned
 * later; this rejects everything that must never reach the resolver: other
 * schemes, embedded credentials, non-standard ports and literal IPs.
 */
function validateRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw rejected();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw rejected();
  if (url.username || url.password) throw rejected();
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) throw rejected();
  // URL.hostname keeps IPv6 brackets; strip them before testing for a literal.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || net.isIP(hostname)) throw rejected();
  url.hash = '';
  return url;
}

/** The page URL may carry a path; the icon always comes from the site root. */
export function faviconTarget(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw rejected();
  const site = validateRemoteUrl(value);
  return new URL('/favicon.ico', site.origin);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Trust the bytes, not the upstream label: many icon servers mislabel .ico. */
export function sniffImage(bytes: Buffer): string | null {
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && bytes.readUInt16LE(4) > 0) return 'image/x-icon';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp' && /^avi[fs]$/.test(bytes.subarray(8, 12).toString('ascii'))) return 'image/avif';
  return null;
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw notFound();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch one icon, re-validating and re-pinning every redirect hop. The
 * destination must be public at DNS level (checked by resolveAndPin) and the
 * connection is pinned to the validated address, so a rebinding DNS answer
 * cannot move the request to an internal host between check and connect.
 */
export async function readFavicon(target: URL, deps: FaviconDeps = {}): Promise<Favicon> {
  const fetchImpl = deps.fetchImpl || fetch;
  const resolve = deps.resolve || resolveAndPin;
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let agent: ReturnType<typeof createPinnedAgent> | null = null;
    let response: Response;
    try {
      const addresses = await resolve(current.hostname);
      agent = createPinnedAgent(addresses);
      response = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: ACCEPT, 'user-agent': USER_AGENT },
        dispatcher: agent,
      } as RequestInit & { dispatcher: unknown });
    } catch (error) {
      await agent?.close().catch(() => {});
      if (error instanceof ApiError) throw error;
      if (/blocked|dns-timeout/i.test(String((error as Error)?.message || ''))) throw rejected();
      throw unavailable();
    }
    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      await agent.close().catch(() => {});
      if (!location) throw unavailable();
      try {
        current = validateRemoteUrl(new URL(location, current).href);
      } catch {
        throw rejected();
      }
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      await agent.close().catch(() => {});
      throw notFound();
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      await response.body.cancel().catch(() => {});
      await agent.close().catch(() => {});
      throw notFound();
    }
    let bytes: Buffer;
    try {
      bytes = await readCapped(response.body);
    } finally {
      await agent.close().catch(() => {});
    }
    const type = sniffImage(bytes);
    if (!type) throw notFound();
    return { bytes, type };
  }
  throw unavailable();
}

const iconCache = createRemoteCache<Favicon>(24 * 3600_000, 512, (value) => value.bytes.length, 16 * 1024 * 1024);

export function getFavicon(value: unknown, deps?: FaviconDeps): Promise<Favicon> {
  const target = faviconTarget(value);
  return iconCache(target.href, () => readFavicon(target, deps));
}
