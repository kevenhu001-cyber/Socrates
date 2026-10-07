/* urlSafety — small, dependency-free helpers shared by the markdown renderer
 * and the artifact/island builders. Kept separate from `messageContent.ts`
 * (which pulls in `marked`) so pure string builders and their tests stay
 * hermetic. */

export function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function safeImage(value: string): string | null {
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  const link = safeLink(value);
  return link && /^https?:/.test(link) ? link : null;
}

export function plainText(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[entity]) return named[entity];
    const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}
