/**
 * Preserves text as-is without forceful punctuation replacement.
 * Punctuation rules (full-width in Chinese, half-width in English/code/math)
 * are governed by system prompts and model output contracts.
 */
export function normalizeChineseProse(text: string): string {
  return String(text ?? '');
}

