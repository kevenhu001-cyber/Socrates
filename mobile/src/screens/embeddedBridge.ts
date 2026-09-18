import type { EmbeddedTarget, MobileWebViewMessage } from '@socrates/contracts';

export const EMBEDDED_TARGETS: readonly EmbeddedTarget[] = [
  'projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'skills', 'api-settings',
  'profile', 'usage', 'storage', 'display', 'shortcuts', 'library', 'exam',
];

export function isEmbeddedTarget(value: unknown): value is EmbeddedTarget {
  return typeof value === 'string' && (EMBEDDED_TARGETS as readonly string[]).includes(value);
}

export function parseBridgeMessage(raw: string): MobileWebViewMessage | null {
  try {
    const value = JSON.parse(raw) as Partial<MobileWebViewMessage> & { url?: unknown; target?: unknown; filename?: unknown };
    if (!value || typeof value.type !== 'string') return null;
    if (value.type === 'navigate') return isEmbeddedTarget(value.target) ? { type: 'navigate', target: value.target } : null;
    if (value.type === 'openExternal' && typeof value.url === 'string') return { type: 'openExternal', url: value.url };
    if (value.type === 'download' && typeof value.url === 'string') return { type: 'download', url: value.url, ...(typeof value.filename === 'string' ? { filename: value.filename } : {}) };
    if (value.type === 'ready') return { type: 'ready' };
    if (value.type === 'authExpired') return { type: 'authExpired' };
    if (value.type === 'close') return { type: 'close' };
    return null;
  } catch {
    return null;
  }
}
