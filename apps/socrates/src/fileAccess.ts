import type { StoredFile } from '@socrates/contracts';

/* Platform file access for stored uploads: resolve an authenticated image
 * source and download/open the raw bytes. Web builds a blob URL through the
 * authed fetch; native keeps the bearer in request headers (RN Image can
 * carry them) and downloads to the cache before opening. */

export interface FileAccessTarget {
  rawUrl(id: string): string;
  fetch?(url: string, init?: RequestInit): Promise<Response>;
  readToken?(): Promise<string | undefined>;
}

export interface FileImageSource {
  uri: string;
  headers?: Record<string, string>;
  revoke?(): void;
}

export type StoredFileRef = Pick<StoredFile, 'id' | 'name' | 'mimeType'> & Partial<Pick<StoredFile, 'size' | 'kind'>>;

export async function resolveStoredImage(_id: string, _target: FileAccessTarget): Promise<FileImageSource | null> {
  return null;
}

export async function downloadStoredFile(_file: StoredFileRef, _target: FileAccessTarget): Promise<void> {
  throw new Error('File download is unavailable on this platform');
}
