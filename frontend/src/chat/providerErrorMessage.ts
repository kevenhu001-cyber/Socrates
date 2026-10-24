/** Keep provider cooldowns actionable without promising an availability time. */
export function providerErrorMessage(
  error: { message?: string; status?: number; code?: string; body?: Record<string, unknown> },
  translate?: (key: string) => string,
): string {
  const body = error.body;
  if ((error.status ?? body?.status) === 429
      && (error.code ?? body?.code) === 'LLM_UPSTREAM_ERROR'
      && typeof body?.retryAfterMs === 'number' && Number.isFinite(body.retryAfterMs) && body.retryAfterMs >= 0) {
    const key = 'chat.modelBusyCooldown';
    const translated = translate?.(key);
    const template = translated && translated !== key ? translated
      : 'The model is busy. Try again in about {seconds}s, or switch models.';
    return template.replace('{seconds}', String(Math.max(1, Math.ceil(body.retryAfterMs / 1000))));
  }
  return error.message || 'stream request failed';
}
