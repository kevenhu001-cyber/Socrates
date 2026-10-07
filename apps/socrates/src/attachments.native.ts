import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { ATTACH_MAX_BYTES, stagedKindFor, type PickedFile } from './attachmentModels';

/* Native attachment picker (Expo). Images resolve to base64 data URLs on
 * the spot; plain text is read from cache; office/PDF documents upload to
 * /files/extract at send time via FileSystem.uploadAsync (RN fetch cannot
 * stream file:// bodies, and uploadAsync is the supported multipart path). */

export const supportsCamera = true;

function checkSize(name: string, size: number | null | undefined) {
  if ((size || 0) > ATTACH_MAX_BYTES) throw new Error(`${name} exceeds the 25 MB limit`);
}

export async function pickImages(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library permission is required to attach images');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    base64: true,
    quality: 0.9,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    checkSize(asset.fileName || 'image', asset.fileSize);
    const mime = asset.mimeType || 'image/jpeg';
    return {
      name: asset.fileName || `photo.${mime.split('/')[1] || 'jpg'}`,
      mime,
      size: asset.fileSize || 0,
      stagedKind: 'image' as const,
      dataUrl: `data:${mime};base64,${asset.base64 || ''}`,
    };
  });
}

export async function capturePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera permission is required to take a photo');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.9 });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  checkSize(asset.fileName || 'photo', asset.fileSize);
  const mime = asset.mimeType || 'image/jpeg';
  return {
    name: asset.fileName || `photo.${mime.split('/')[1] || 'jpg'}`,
    mime,
    size: asset.fileSize || 0,
    stagedKind: 'image',
    dataUrl: `data:${mime};base64,${asset.base64 || ''}`,
  };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  checkSize(asset.name, asset.size ?? null);
  const stagedKind = stagedKindFor(asset.mimeType || '', asset.name);
  if (stagedKind === 'text') {
    const text = await FileSystem.readAsStringAsync(asset.uri);
    return { name: asset.name, mime: asset.mimeType || 'text/plain', size: asset.size || 0, stagedKind, text };
  }
  return { name: asset.name, mime: asset.mimeType || 'application/octet-stream', size: asset.size || 0, stagedKind, nativeUri: asset.uri };
}

/** Upload a picked document for server-side text extraction. */
interface ExtractBody { ok?: boolean; text?: string; truncated?: boolean; kind?: string; error?: string }
export async function extractPickedDocument(
  picked: PickedFile,
  input: { endpoint: string; token?: string },
): Promise<{ text: string; truncated: boolean; kind?: string }> {
  if (!picked.nativeUri) throw new Error(`${picked.name} has no uploadable file`);
  const headers: Record<string, string> = {};
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  const response = await FileSystem.uploadAsync(input.endpoint, picked.nativeUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: picked.mime,
    headers,
  });
  let body: ExtractBody | null = null;
  try { body = JSON.parse(response.body) as ExtractBody; } catch { body = null; }
  if (response.status !== 200 || !body || body.ok === false) {
    throw new Error(body?.error || `Could not read ${picked.name} (${response.status})`);
  }
  return { text: body.text || '', truncated: !!body.truncated, kind: body.kind };
}
