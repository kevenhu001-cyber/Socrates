/**
 * Small shape readers shared by the LLM transport.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function reasoningText(delta: unknown): string {
  if (!isRecord(delta)) return '';
  const raw = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
  if (typeof raw === 'string') return raw;
  return isRecord(raw) && typeof raw.text === 'string' ? raw.text : '';
}
