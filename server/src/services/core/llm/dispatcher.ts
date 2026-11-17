/**
 * Upstream HTTP dispatcher, DNS cache and keep-warm probe.
 */
import dns from 'node:dns';
import { Agent, EnvHttpProxyAgent, ProxyAgent, type Dispatcher } from 'undici';

let _llmDispatcher: Dispatcher | null = null;
const _dnsCache = new Map<string, { addresses: Array<{ address: string; family: number }>; expires: number }>();
const DNS_CACHE_TTL_MS = 60_000;

function cachedDnsLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void,
) {
  const now = Date.now();
  const cached = _dnsCache.get(hostname);
  if (cached && cached.expires > now) {
    return cb(null, cached.addresses);
  }
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses.map((a) => ({ address: a.address, family: a.family }));
    _dnsCache.set(hostname, { addresses: list, expires: now + DNS_CACHE_TTL_MS });
    cb(null, list);
  });
}

export function getLlmDispatcher(): Dispatcher {
  if (_llmDispatcher) return _llmDispatcher;
  const proxyUrl = process.env.LLM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.all_proxy;
  if (proxyUrl) {
    if (process.env.LLM_PROXY && !process.env.HTTPS_PROXY) {
      process.env.HTTPS_PROXY = process.env.LLM_PROXY;
    }
    _llmDispatcher = new EnvHttpProxyAgent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 300_000,
      connections: 64,
      pipelining: 1,
      connectTimeout: 5_000,
      headersTimeout: 30_000,
      connect: {
        keepAlive: true,
        keepAliveInitialDelay: 10_000,
        noDelay: true,
      },
    });
  } else {
    _llmDispatcher = new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 300_000,
      connections: 64,
      pipelining: 1,
      connectTimeout: 5_000,
      headersTimeout: 30_000,
      connect: {
        lookup: cachedDnsLookup as never,
        keepAlive: true,
        keepAliveInitialDelay: 10_000,
        noDelay: true,
      },
    });
  }
  return _llmDispatcher;
}

let _lastLlmActivityTime = 0;
let _keepWarmTimer: ReturnType<typeof setInterval> | null = null;

export function markLlmActivity(): void {
  _lastLlmActivityTime = Date.now();
}

/** Keep upstream TLS connection hot so users experience 0ms connection setup overhead.
 * SenseNova and other API gateways close idle keepalive connections after ~10-15s.
 * This lightweight probe sends a HEAD request to the API host every 8s when idle,
 * keeping the warm TCP/TLS socket alive in undici's connection pool. */
export function startLlmKeepWarmWorker(targetBaseUrl?: string): void {
  if (_keepWarmTimer) return;
  const url = targetBaseUrl || process.env.BEAGLE_SYSTEM_URL || 'https://token.sensenova.cn/v1';
  let hostUrl: string;
  try {
    const parsed = new URL(url);
    hostUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    hostUrl = 'https://token.sensenova.cn';
  }

  _keepWarmTimer = setInterval(async () => {
    // If an actual LLM request happened recently (< 8s ago), connection is already hot
    if (Date.now() - _lastLlmActivityTime < 8_000) return;
    try {
      await fetch(hostUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(4_000),
        dispatcher: getLlmDispatcher(),
      } as unknown as RequestInit).catch(() => {});
    } catch {
      // Swallowed: network probes never throw
    }
  }, 8_000);

  _keepWarmTimer.unref?.();
}

/* Streaming completions have no server-owned deadline. They continue until
 * the provider settles or the caller explicitly aborts (for example, Stop). */
