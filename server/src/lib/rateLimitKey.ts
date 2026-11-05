import { ipKeyGenerator } from 'express-rate-limit';

/** Group IPv6 privacy addresses by the limiter's default /56 subnet. Keep
 * IPv4 unchanged, and never create a fresh bucket for a missing address. */
export function rateLimitIpKey(req: { ip?: string }): string {
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
}
