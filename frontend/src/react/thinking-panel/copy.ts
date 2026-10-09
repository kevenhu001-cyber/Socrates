export function translate(key: string, fallback: string): string {
  try {
    const w = window as unknown as { t?: (key: string) => string };
    if (typeof w.t === 'function') {
      const value = w.t(key);
      if (typeof value === 'string' && value && value !== key) return value;
    }
  } catch (_) { /* ignore */ }
  return fallback;
}
