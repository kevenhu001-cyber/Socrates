/**
 * errorMessages — localized copy for the server's error contract.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The API serialised every failure with an English sentence. The SPA ships
 * a Chinese interface, so a Chinese user saw an English sentence inside a
 * Chinese toast — a mixed-language surface that reads as broken even when
 * the error itself is clear.
 *
 * The rule that keeps this safe:
 *
 *   - The MACHINE contract is unchanged. `code` stays the identifier, the
 *     HTTP status stays the status, and `retryable` / `upstreamStatus` /
 *     `retryAfterMs` are untouched. A client keys off `code`, never off
 *     the sentence.
 *   - Only GENERIC copy is translated. When an error carries its own
 *     wording (a limit that names the user's plan, a validation message
 *     that names the offending field), that text is left exactly as the
 *     server produced it. Translating a sentence the server composed
 *     would mean inventing content the server never wrote.
 *   - The locale comes from the REQUEST, not from a server default. The
 *     SPA sends `X-Socrates-Locale`; anything else falls back to
 *     `Accept-Language`. English stays the default so an unknown client
 *     sees exactly what it saw before.
 *
 * A code that is not in the catalog is returned untouched — the catalog
 * only covers the errors the middleware can produce on its own.
 */

export type ErrorLocale = 'en' | 'zh';

export const SUPPORTED_ERROR_LOCALES: readonly ErrorLocale[] = ['en', 'zh'];

export interface ErrorCopy {
  en: string;
  zh: string;
}

/**
 * The generic copy the server produces on its own, keyed by error code.
 *
 * The `en` value must match the message the server currently sends, byte
 * for byte: `localizeErrorCode` uses that match to decide whether a
 * message is generic (translatable) or server-composed (keep as-is).
 */
export const ERROR_COPY: Readonly<Record<string, ErrorCopy>> = Object.freeze({
  BAD_REQUEST: { en: 'Bad request', zh: '请求无效' },
  INVALID_REQUEST: { en: 'Invalid request', zh: '请求无效' },
  UNAUTHORIZED: { en: 'Not authenticated', zh: '登录状态已失效，请重新登录' },
  FORBIDDEN: { en: 'Forbidden', zh: '没有权限执行此操作' },
  NOT_FOUND: { en: 'Not found', zh: '未找到对应内容' },
  ENDPOINT_NOT_FOUND: { en: 'Endpoint not found', zh: '接口不存在' },
  CONFLICT: { en: 'Conflict', zh: '操作与当前状态冲突，请刷新后重试' },
  TOO_MANY_REQUESTS: { en: 'Too many requests', zh: '操作过于频繁，请稍后再试' },
  PAYLOAD_TOO_LARGE: { en: 'Payload too large', zh: '上传内容过大' },
  INTERNAL_ERROR: { en: 'An unexpected error occurred', zh: '服务出现异常，请稍后再试' },
  VALIDATION_ERROR: { en: 'Request validation failed', zh: '请求参数校验未通过' },
  REQUEST_TIMEOUT: { en: 'Request timed out', zh: '请求超时，请重试' },
  FILE_TOO_LARGE: { en: 'File exceeds the 25 MB size limit', zh: '文件超过 25 MB 上限' },
  NO_PROVIDER: { en: 'No provider is configured', zh: '尚未配置可用的模型服务' },
  MODEL_MODE_UNSUPPORTED: {
    en: 'This model does not support Instant. Select Low, Medium or High thinking, or choose a model that supports Instant.',
    zh: '当前模型不支持「即时」模式，请改用低/中/高思考档位，或选择支持即时模式的模型。',
  },
  TURN_IDLE_TIMEOUT: {
    en: 'The model stopped making progress and the turn was cancelled.',
    zh: '模型长时间没有新进展，本轮对话已取消，请重试或更换模型。',
  },
  TURN_MAX_DURATION: {
    en: 'The turn exceeded its maximum duration and was cancelled.',
    zh: '本轮对话超过最长时限，已自动取消，请重试。',
  },
});

/** Is this value one of the locales the server can render? */
export function isErrorLocale(value: unknown): value is ErrorLocale {
  return typeof value === 'string' && (SUPPORTED_ERROR_LOCALES as readonly string[]).includes(value);
}

/**
 * Normalise a locale tag to a supported locale.
 *
 * Accepts `zh`, `zh-CN`, `zh-Hans`, `en`, `en-US` … Returns null when the
 * tag is not a locale this server can render, so callers can fall through
 * to the next signal instead of guessing.
 */
export function normalizeLocale(value: unknown): ErrorLocale | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase();
  if (!tag) return null;
  const primary = tag.split(/[-_]/)[0];
  if (primary === 'zh') return 'zh';
  if (primary === 'en') return 'en';
  return null;
}

/**
 * Read the locale from an `Accept-Language` header.
 *
 * Quality values are honoured: `zh-CN;q=0.9, en;q=0.8` resolves to `zh`.
 * A header that names no supported locale yields null, and the caller
 * keeps the English default.
 */
export function localeFromAcceptLanguage(header: unknown): ErrorLocale | null {
  if (typeof header !== 'string' || !header.trim()) return null;
  const entries = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      let q = 1;
      for (const param of params) {
        const match = /^\s*q=([0-9.]+)\s*$/i.exec(param);
        if (match) {
          const parsed = Number.parseFloat(match[1]);
          if (Number.isFinite(parsed)) q = parsed;
        }
      }
      return { tag: tag.trim(), q };
    })
    .filter((entry) => entry.tag !== '');
  entries.sort((a, b) => b.q - a.q);
  for (const entry of entries) {
    const locale = normalizeLocale(entry.tag);
    if (locale) return locale;
  }
  return null;
}

/**
 * Resolve the locale for a request.
 *
 * The explicit `X-Socrates-Locale` header wins — the SPA knows the
 * language the user actually picked, which may differ from the browser's
 * `Accept-Language` (the OS locale). `Accept-Language` is the fallback for
 * every other client. English is the default.
 */
export function resolveErrorLocale(headers: unknown): ErrorLocale {
  const bag = (headers && typeof headers === 'object') ? headers as Record<string, unknown> : {};
  const explicit = normalizeLocale(bag['x-socrates-locale'] ?? bag['X-Socrates-Locale']);
  if (explicit) return explicit;
  const accepted = localeFromAcceptLanguage(bag['accept-language'] ?? bag['Accept-Language']);
  if (accepted) return accepted;
  return 'en';
}

/**
 * The localized sentence for an error code.
 *
 * `fallback` is the message the server actually produced. It is returned
 * unchanged when:
 *   - the code has no catalog entry (we have nothing to translate);
 *   - the locale is English (nothing to do);
 *   - the message is not the catalog's generic English text, i.e. the
 *     server composed its own wording (a plan name, a field name) and we
 *     must not invent a translation for it.
 */
export function localizeErrorCode(code: string, locale: ErrorLocale, fallback?: string): string {
  const entry = ERROR_COPY[code];
  if (!entry) return fallback ?? '';
  if (locale === 'en') return fallback ?? entry.en;
  if (fallback !== undefined && fallback !== entry.en) return fallback;
  return entry.zh;
}

/**
 * The sentence for an upstream provider failure.
 *
 * The upstream status is interpolated, so this one is a function rather
 * than a catalog entry.
 */
export function upstreamFailureMessage(status: number, locale: ErrorLocale): string {
  if (locale === 'zh') {
    return `模型服务返回错误（上游 ${status}），请稍后重试或切换模型。`;
  }
  return `LLM request failed (upstream ${status}). Try again later or switch model.`;
}
