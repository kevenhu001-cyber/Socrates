import type { EmbeddedTarget, MobileWebViewMessage } from '@socrates/contracts';

export const EMBEDDED_TARGETS: readonly EmbeddedTarget[] = [
  'projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'skills', 'api-settings',
  'profile', 'usage', 'storage', 'display', 'shortcuts', 'library', 'exam',
];

/** Product surfaces remain in the shared contract for older clients, but the
 * native client must route them into RN screens instead of opening a full SPA
 * WebView. `undefined` means the target is an intentionally controlled web
 * surface (currently Skills, OAuth, or an external flow). */
export const NATIVE_EMBEDDED_ROUTES = {
  projects: 'Projects',
  scheduled: 'Scheduled',
  plugins: 'Plugins',
  knowledge: 'Knowledge',
  mistakes: 'Mistakes',
  'api-settings': 'Settings',
  display: 'Display',
  library: 'Library',
  exam: 'ExamSession',
  shortcuts: 'More',
} as const;

export type NativeEmbeddedRoute = (typeof NATIVE_EMBEDDED_ROUTES)[keyof typeof NATIVE_EMBEDDED_ROUTES];

export function nativeRouteForEmbeddedTarget(target: EmbeddedTarget): NativeEmbeddedRoute | null {
  return NATIVE_EMBEDDED_ROUTES[target as keyof typeof NATIVE_EMBEDDED_ROUTES] || null;
}

/** Legacy bridge targets that are now rendered by the root native overlay host. */
export const NATIVE_EMBEDDED_OVERLAYS = {
  profile: 'profile',
  usage: 'usage',
  storage: 'storage',
} as const;

export type NativeEmbeddedOverlay = (typeof NATIVE_EMBEDDED_OVERLAYS)[keyof typeof NATIVE_EMBEDDED_OVERLAYS];

export function nativeOverlayForEmbeddedTarget(target: EmbeddedTarget): NativeEmbeddedOverlay | null {
  return NATIVE_EMBEDDED_OVERLAYS[target as keyof typeof NATIVE_EMBEDDED_OVERLAYS] || null;
}

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
