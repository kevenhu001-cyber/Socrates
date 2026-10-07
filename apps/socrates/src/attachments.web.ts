import type { FetchLike } from '@socrates/api';
import { ATTACH_MAX_BYTES, stagedKindFor, type PickedFile } from './attachmentModels';

/* Web attachment picker. Files come from a hidden <input> element created
 * imperatively (no React tree needed); images resolve to data URLs and
 * plain text resolves immediately, documents stay as File objects for the
 * /files/extract upload at send time. */

export const supportsCamera = false;

function pick(mean: 'images' | 'files'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = globalThis.document.createElement('input');
    input.type = 'file';
    input.accept = mean === 'images'
      ? 'image/png,image/jpeg,image/gif,image/webp'
      : '.pdf,.doc,.docx,.xls,.xlsx,.pptx,.epub,.rtf,.odt,.ods,.odp,.txt,.md,.markdown,.csv,.json,.log';
    if (mean === 'images') input.multiple = true;
    input.onchange = () => resolve([...(input.files || [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function toPicked(file: File): Promise<PickedFile> {
  if (file.size > ATTACH_MAX_BYTES) throw new Error(`${file.name} exceeds the 25 MB limit`);
  const stagedKind = stagedKindFor(file.type, file.name);
  if (stagedKind === 'image') {
    return { name: file.name, mime: file.type || 'image/png', size: file.size, stagedKind, dataUrl: await readDataUrl(file) };
  }
  if (stagedKind === 'text') {
    return { name: file.name, mime: file.type || 'text/plain', size: file.size, stagedKind, text: await file.text() };
  }
  return { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, stagedKind, webFile: file };
}

export async function pickImages(): Promise<PickedFile[]> {
  const files = await pick('images');
  return Promise.all(files.map(toPicked));
}

export async function capturePhoto(): Promise<PickedFile | null> {
  return null;
}

export async function pickDocument(): Promise<PickedFile | null> {
  const [file] = await pick('files');
  return file ? toPicked(file) : null;
}

/** Upload a picked document for server-side text extraction. */
export async function extractPickedDocument(
  picked: PickedFile,
  input: { endpoint: string; token?: string; fetch: FetchLike },
): Promise<{ text: string; truncated: boolean; kind?: string }> {
  if (!picked.webFile) throw new Error(`${picked.name} has no uploadable file`);
  const form = new FormData();
  form.append('file', picked.webFile, picked.name);
  const headers: Record<string, string> = {};
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  const response = await input.fetch(input.endpoint, { method: 'POST', headers, body: form as unknown as BodyInit });
  const body = await response.json().catch(() => null) as { ok?: boolean; text?: string; truncated?: boolean; kind?: string; error?: string } | null;
  if (!response.ok || !body || body.ok === false) {
    throw new Error(body?.error || `Could not read ${picked.name} (${response.status})`);
  }
  return { text: body.text || '', truncated: !!body.truncated, kind: body.kind };
}
