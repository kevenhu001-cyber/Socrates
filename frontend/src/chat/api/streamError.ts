/* The error shape shared by request failures and structured SSE error frames.
 *
 * Deliberately dependency-free: the server's cross-tier contract test
 * (`server/test/llmProtocol.test.mjs`) imports this module to prove that an
 * emitter frame the browser receives classifies the same way on both sides.
 * A server test may only import frontend modules whose graph carries no SPA
 * store / i18n / DOM dependency, so this stays a leaf. */
import type { ChatApiError } from './shared.ts';

/** Keep the same error shape for request failures and structured SSE errors. */
export function makeStreamError(
  message: unknown,
  status?: unknown,
  body?: Record<string, unknown> | null,
): ChatApiError {
  const error = new Error(String(message || 'stream request failed')) as ChatApiError;
  if (status != null) error.status = Number(status);
  if (body != null) error.body = body;
  if (body && (body as { code?: string }).code) error.code = (body as { code: string }).code;
  return error;
}
