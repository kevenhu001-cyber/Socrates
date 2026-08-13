import type { ArtifactMessage } from '@socrates/contracts';

const MAX_BRIDGE_TEXT = 20_000;
const MAX_ARTIFACT_HEIGHT = 50_000;
const MAX_ARTIFACT_SOURCE = 250_000;

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Only admit a small, typed bridge protocol from generated artifact HTML. */
export function parseArtifactMessage(raw: string, expectedArtifactId: string): ArtifactMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case 'ready':
      return record.artifactId === expectedArtifactId ? { type: 'ready', artifactId: expectedArtifactId } : null;
    case 'resize':
      return typeof record.height === 'number' && Number.isFinite(record.height) && record.height > 0 && record.height <= MAX_ARTIFACT_HEIGHT
        ? { type: 'resize', height: Math.ceil(record.height) }
        : null;
    case 'openLink': {
      const url = safeExternalUrl(record.url);
      return url ? { type: 'openLink', url } : null;
    }
    case 'copy':
      return typeof record.text === 'string' && record.text.length <= MAX_BRIDGE_TEXT ? { type: 'copy', text: record.text } : null;
    case 'share':
      return typeof record.title === 'string' && typeof record.content === 'string'
        && record.title.length <= 300 && record.content.length <= MAX_BRIDGE_TEXT
        ? { type: 'share', title: record.title, content: record.content }
        : null;
    case 'error':
      return typeof record.message === 'string' && record.message.length <= 2_000 ? { type: 'error', message: record.message } : null;
    default:
      return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

/**
 * Native WebView has no iframe sandbox. Accept only static presentational
 * markup, then run the small, nonced bridge script that this app owns. This is
 * intentionally the same safety boundary as the web visualisation extension:
 * interactivity that needs arbitrary script/network access degrades to source
 * text instead of receiving a privileged mobile WebView.
 */
export function isSafeArtifactHtml(value: string): boolean {
  if (value.length > MAX_ARTIFACT_SOURCE) return false;
  if (/<(?:script|iframe|object|embed|form|base|meta|link)\b/i.test(value)) return false;
  if (/\son\w+\s*=/i.test(value)) return false;
  if (/\b(?:fetch|xmlhttprequest|websocket|eventsource|sendbeacon)\b/i.test(value)) return false;
  const urlAttribute = /\b(?:src|href|action|formaction|xlink:href)\s*=\s*["']?\s*([^\s"'>]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlAttribute.exec(value)) !== null) {
    if (/^(?:javascript|vbscript|livescript|file|data\s*:\s*text\/html)/i.test(match[1])) return false;
  }
  return true;
}

/** Return a readable, escaped fallback whenever generated markup is unsafe. */
export function safeArtifactHtml(value: string): string {
  if (isSafeArtifactHtml(value)) return value;
  const preview = value.slice(0, 80_000);
  return `<pre style="white-space:pre-wrap;word-break:break-word">This artifact contains active content and cannot be run in the mobile preview.\n\n${escapeHtml(preview)}</pre>`;
}
