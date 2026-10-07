import type { FileAccessTarget, FileImageSource, StoredFileRef } from './fileAccess';

/* Web: the raw endpoint requires the bearer, so both preview and download
 * fetch the bytes through the authed client and hand out an object URL. */

async function fetchBlob(id: string, target: FileAccessTarget): Promise<Blob> {
  const fetcher = target.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher(target.rawUrl(id), { headers: { Accept: '*/*' } });
  if (!response.ok) throw new Error(`File request failed (${response.status})`);
  return response.blob();
}

export async function resolveStoredImage(id: string, target: FileAccessTarget): Promise<FileImageSource | null> {
  const blob = await fetchBlob(id, target);
  const uri = URL.createObjectURL(blob);
  return { uri, revoke: () => URL.revokeObjectURL(uri) };
}

export async function downloadStoredFile(file: StoredFileRef, target: FileAccessTarget): Promise<void> {
  const blob = await fetchBlob(file.id, target);
  const uri = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = uri;
  link.download = file.name || 'download';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(uri), 30_000);
}
