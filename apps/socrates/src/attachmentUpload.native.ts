import * as FileSystem from 'expo-file-system/legacy';
import type { StagedAttachment } from './attachmentModels';
import type { AttachmentUploadTarget } from './attachmentUpload';

/* Native upload: React Native fetch cannot stream file:// bodies, so we use
 * FileSystem.uploadAsync (the supported multipart path, same as
 * /files/extract). Images arrive as base64 data URLs (no cache file) and
 * plain text as a string, so both are materialized to a cache file first. */

function base64FromDataUrl(dataUrl: string): { base64: string; ext: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match || !match[2]) return null;
  return { base64: match[3] ?? '', ext: (match[1] || '').split('/')[1] || 'bin' };
}

async function materialize(staged: StagedAttachment): Promise<string | null> {
  if (staged.nativeUri) return staged.nativeUri;
  if (staged.dataUrl) {
    const payload = base64FromDataUrl(staged.dataUrl);
    if (!payload) return null;
    const uri = `${FileSystem.cacheDirectory}${staged.localId}.${payload.ext}`;
    await FileSystem.writeAsStringAsync(uri, payload.base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  }
  if (staged.text !== undefined) {
    const uri = `${FileSystem.cacheDirectory}${staged.localId}.txt`;
    await FileSystem.writeAsStringAsync(uri, staged.text, { encoding: FileSystem.EncodingType.UTF8 });
    return uri;
  }
  return null;
}

export async function persistStagedAttachment(
  staged: StagedAttachment,
  target: AttachmentUploadTarget,
  sessionId: string,
): Promise<string | null> {
  const uri = await materialize(staged);
  if (!uri) return null;
  const headers: Record<string, string> = {};
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  const response = await FileSystem.uploadAsync(target.url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: staged.mime,
    headers,
    parameters: { sessionId },
  });
  if (response.status !== 200 && response.status !== 201) return null;
  try { return (JSON.parse(response.body) as { id?: string }).id ?? null; }
  catch { return null; }
}
