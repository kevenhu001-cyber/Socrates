import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent } from 'undici';

/** Private, loopback, link-local, metadata and reserved address ranges. */
export function isPrivateIp(addr: string): boolean {
  // Normalise IPv4-mapped IPv6 (::ffff:x.x.x.x) to plain IPv4
  if (addr.includes('.')) {
    const ipv4Match = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipv4Match) addr = ipv4Match[1];
  }
  if (net.isIP(addr) === 4) {
    const parts = addr.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT
    if (parts[0] === 0) return true; // 0.0.0.0/8
    if (parts[0] >= 224) return true; // multicast / reserved
  } else if (net.isIP(addr) === 6) {
    const lower = addr.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('2002:')) return true; // 6to4 (2002::/16)
    if (lower.startsWith('64:ff9b:')) return true; // NAT64
    if (lower.startsWith('100:')) return true; // discard-only (100::/64)
  }
  return false;
}

/**
 * Resolve a hostname and reject private answers before any connection.
 * The returned records must also be pinned on the connection; see
 * createPinnedAgent.
 */
export async function resolveAndPin(hostname: string) {
  const records = await Promise.race([
    dns.lookup(hostname, { all: true }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), 3000)),
  ]);
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error(`Blocked: ${hostname} resolves to private IP ${r.address}`);
    }
  }
  return records;
}

/**
 * Create an undici Agent whose connector pins DNS to pre-resolved
 * addresses. Passed to fetch() via the `dispatcher` option so the
 * actual TCP connection uses the exact IPs we already validated — this
 * closes the DNS-rebinding (TOCTOU) window between lookup and connect.
 * Node's built-in fetch ignores the http.Agent `agent` option; it only
 * honours an undici dispatcher.
 */
export function createPinnedAgent(addresses: { address: string; family: number }[]) {
  // undici's connector invokes lookup with all-addresses semantics: the
  // callback must yield an array of { address, family } records (NOT the
  // single-address `net.LookupFunction` form, which makes undici read an
  // undefined address). Every record here was already validated as a
  // public IP, so returning the full set lets undici round-robin / retry
  // across them while staying pinned.
  const lookup = (
    _hostname: string,
    _opts: unknown,
    cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void,
  ) => {
    cb(
      null,
      addresses.map((a) => ({ address: a.address, family: a.family })),
    );
  };
  // TLS still validates against the request hostname (undici sets the
  // SNI/servername from the URL); only the resolved IP is pinned.
  return new Agent({ connect: { lookup: lookup as never, rejectUnauthorized: true } });
}
