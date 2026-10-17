import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, type Database } from '../../db/index.js';
import { idempotencyReceipts } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';

export type WriteTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type JsonWrite = (tx: WriteTransaction) => Promise<{ status: number; body: unknown }>;
export type WriteScope = { userId: string; credentialHash: string; operation: string; key: string; body: unknown };
const MAX_RESPONSE_BYTES = 256 * 1024;

// Incoming bodies are JSON. Sort object keys without changing array order or
// using an object accumulator (which would treat __proto__ specially).
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Callback must perform ONLY transactional DB work through tx. No external
 * calls, filesystem changes, response sends, or writes using getDb(). A crash
 * rolls both the mutation and receipt back; a committed result survives restart.
 */
export async function runDurableJsonWrite(scope: WriteScope | null, work: JsonWrite) {
  return getDb().transaction(async (tx) => {
    let keyHash = '';
    let fingerprint = '';
    if (scope) {
      keyHash = hash(JSON.stringify([scope.userId, scope.credentialHash, scope.operation, scope.key]));
      fingerprint = hash(canonicalJson(scope.body));
      // Transaction-scoped, nonblocking and released by PG even on process death.
      // A 64-bit hash collision only causes a transient busy response.
      const lockId = BigInt.asIntN(64, BigInt('0x' + keyHash.slice(0, 16))).toString();
      const lock = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(${lockId}::bigint) as acquired`);
      if (!lock.rows[0]?.acquired) throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Request is still running; retry with the same key');
      const [receipt] = await tx.select().from(idempotencyReceipts)
        .where(sql`${idempotencyReceipts.keyHash} = ${keyHash} AND ${idempotencyReceipts.expiresAt} > clock_timestamp()`);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with a different request body');
        if (receipt.responseBody === null) throw new ApiError(409, 'IDEMPOTENCY_RESULT_UNAVAILABLE', 'Write completed; retrieve the resource instead of repeating it');
        return { status: receipt.statusCode, serialized: receipt.responseBody, replayed: true };
      }
      await tx.delete(idempotencyReceipts).where(eq(idempotencyReceipts.keyHash, keyHash));
    }
    const result = await work(tx);
    if (result.status < 200 || result.status >= 300) throw new Error('Transactional JSON writes must return a successful status');
    const serialized = JSON.stringify(result.body);
    if (serialized === undefined) throw new Error('Transactional JSON writes must return JSON');
    if (scope) await tx.insert(idempotencyReceipts).values({
      keyHash, userId: scope.userId, operation: scope.operation, fingerprint,
      statusCode: result.status,
      responseBody: Buffer.byteLength(serialized) <= MAX_RESPONSE_BYTES ? serialized : null,
      expiresAt: sql`clock_timestamp() + interval '24 hours'`,
    });
    return { status: result.status, serialized, replayed: false };
  });
}
