/**
 * SSRF guard rails for LLM and Agent provider URLs.
 * Rejects non-https, private/internal IPs (RFC1918), loopback, link-local,
 * cloud metadata (169.254.169.254), carrier-grade NAT, and localhost names.
 */
export function isAllowedProviderUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  let u: URL;
  try { u = new URL(raw); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  // Reject userinfo / fragment / non-default ports.
  if (u.username || u.password || u.hash) return false;
  // Block obvious names first.
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  // Parse IP literal. If hostname is not an IP, allow it (public DNS will resolve later);
  // If it IS an IP, validate it's public.
  const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  if (isIPv4) {
    const parts = host.split('.').map(Number);
    if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return false;                                  // RFC1918
    if (a === 127) return false;                                 // loopback
    if (a === 0) return false;                                   // 0.0.0.0/8
    if (a === 169 && b === 254) return false;                    // link-local (AWS/GCP metadata)
    if (a === 172 && b >= 16 && b <= 31) return false;          // RFC1918
    if (a === 192 && b === 168) return false;                    // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return false;          // carrier-grade NAT
    if (a >= 224) return false;                                  // multicast / reserved
  }
  // IPv6 literal: block loopback, link-local, ULA, multicast, and IPv4-mapped addresses.
  if (host.includes(':')) {
    const h = host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0];
    if (h === '::1' || h === '::') return false;
    if (h.startsWith('ff')) return false; // ff00::/8 multicast
    if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return false; // fe80::/10 link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return false; // fc00::/7 ULA
    if (h.startsWith('100:') || h.startsWith('2001:db8:')) return false; // discard-only & documentation
    if (h.startsWith('::ffff:')) {
      const suffix = h.slice(7);
      let v4: string | null = null;
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(suffix)) {
        v4 = suffix;
      } else {
        const parts = suffix.split(':');
        if (parts.length === 2) {
          const w1 = parseInt(parts[0], 16);
          const w2 = parseInt(parts[1], 16);
          if (!Number.isNaN(w1) && !Number.isNaN(w2) && w1 >= 0 && w1 <= 0xffff && w2 >= 0 && w2 <= 0xffff) {
            v4 = `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;
          }
        }
      }
      if (!v4 || !isAllowedProviderUrl('https://' + v4 + '/')) return false;
      return true;
    }
    if (h.startsWith('::')) return false; // ::/96 deprecated IPv4-compatible
    return true;
  }
  return true;
}
