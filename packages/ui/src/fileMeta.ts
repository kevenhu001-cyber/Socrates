/* fileMeta — DOM-free helpers for stored-file display and raw-URL parsing,
 * shared by the transcript attachment cards and the app's Files screen. */

/** `/api/files/:id/raw`, `/api/v2/files/:id/raw` — relative or absolute. */
export function storedFileIdFromRawUrl(value: string): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  let path = text;
  if (!text.startsWith('/')) {
    try { path = new URL(text).pathname; } catch { return null; }
  }
  const match = /^\/api\/(?:v2\/)?files\/([0-9a-fA-F-]{36})\/raw\/?$/.exec(path.split(/[?#]/)[0]);
  return match ? match[1].toLowerCase() : null;
}

/** Every stored-file id referenced by markdown image/prose text (`raw` URLs). */
export function storedFileIdsInText(text: string): string[] {
  const found = String(text || '').matchAll(/\/api\/(?:v2\/)?files\/([0-9a-fA-F-]{36})\/raw\b/g);
  const ids: string[] = [];
  for (const match of found) {
    const id = match[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  const rounded = index === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[index]}`;
}

/** Short uppercase tag for a file row: extension when it is sane, else mime. */
export function fileKindLabel(name: string, mime?: string): string {
  const dot = String(name || '').lastIndexOf('.');
  const ext = dot > 0 ? String(name).slice(dot + 1) : '';
  if (ext.length >= 1 && ext.length <= 5) return ext.toUpperCase();
  const type = String(mime || '').split('/').pop() || '';
  return type ? type.toUpperCase() : 'FILE';
}

export function isImageMime(mime: string | undefined | null): boolean {
  return !!mime && String(mime).toLowerCase().startsWith('image/');
}
