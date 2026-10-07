import * as FileSystem from 'expo-file-system/legacy';
import { Linking, Share } from 'react-native';
import type { FileAccessTarget, FileImageSource, StoredFileRef } from './fileAccess';

/* Native: RN Image streams the raw URL directly and can send the bearer in
 * headers, so image preview needs no fetch. Downloads go through
 * FileSystem.downloadAsync (RN fetch cannot stream file bodies). */

async function authHeaders(target: FileAccessTarget): Promise<Record<string, string> | undefined> {
  const token = target.readToken ? await target.readToken() : undefined;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function resolveStoredImage(id: string, target: FileAccessTarget): Promise<FileImageSource | null> {
  const headers = await authHeaders(target);
  return { uri: target.rawUrl(id), ...(headers ? { headers } : {}) };
}

export async function downloadStoredFile(file: StoredFileRef, target: FileAccessTarget): Promise<void> {
  const headers = await authHeaders(target);
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  const safeName = String(file.name || file.id).replace(/[^\w.-]+/g, '_').slice(0, 120) || 'download';
  const destination = `${directory}${file.id}-${safeName}`;
  const result = await FileSystem.downloadAsync(target.rawUrl(file.id), destination, headers ? { headers } : {});
  if (result.status !== 200) throw new Error(`Download failed (${result.status})`);
  try { await Linking.openURL(result.uri); }
  catch { await Share.share({ title: file.name, message: result.uri }); }
}
