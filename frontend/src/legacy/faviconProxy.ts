export function faviconProxyUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password
      ? `/api/favicons?url=${encodeURIComponent(parsed.origin)}`
      : null;
  } catch {
    return null;
  }
}
