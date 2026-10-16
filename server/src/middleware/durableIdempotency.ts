import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { ApiError, BadRequest, Unauthorized } from '../lib/errors.js';
import { requestCredential } from './auth.js';
import { runDurableJsonWrite, type JsonWrite } from '../services/core/durableIdempotency.js';

/** Call only after requireAuth and the route's permission middleware. */
export async function durableJsonWrite(req: Request, res: Response, operation: string, work: JsonWrite) {
  if (!req.userId) throw new Unauthorized();
  const raw = req.headers['idempotency-key'];
  if (raw !== undefined && (typeof raw !== 'string' || !/^[\x21-\x7E]{1,200}$/.test(raw))) {
    throw new BadRequest('Idempotency-Key must contain 1–200 printable ASCII characters without spaces');
  }
  const credential = requestCredential(req);
  if (raw && !credential) throw new Unauthorized();
  try {
    const result = await runDurableJsonWrite(raw ? {
      userId: req.userId,
      credentialHash: createHash('sha256').update(credential!.token).digest('hex'),
      operation, key: raw, body: req.body ?? null,
    } : null, work);
    if (raw) res.set('Idempotency-Key', raw);
    if (result.replayed) res.set('Idempotency-Replayed', 'true');
    return res.status(result.status).type('application/json').send(result.serialized);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'IDEMPOTENCY_IN_PROGRESS') res.set('Retry-After', '1');
    throw err;
  }
}
