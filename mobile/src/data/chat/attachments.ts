import type { Attachment } from '@socrates/contracts';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
import { filesApi } from '../api/client';
import { native, type NativeFileAsset } from '../../native/native';
import { tSync } from '../../i18n';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 1_900_000;
const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.82;

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function imageMime(asset: NativeFileAsset) {
  if (asset.mimeType?.startsWith('image/')) return asset.mimeType;
  const name = asset.name || asset.fileName || '';
  const extension = name.toLowerCase().split('.').pop();
  return extension === 'png' ? 'image/png'
    : extension === 'webp' ? 'image/webp'
      : extension === 'gif' ? 'image/gif'
        : 'image/jpeg';
}

function assetName(asset: NativeFileAsset, fallback: string) {
  return asset.name || asset.fileName || fallback;
}

function dimensions(uri: string, width?: number, height?: number): Promise<{ width: number; height: number } | null> {
  if (width && height) return Promise.resolve({ width, height });
  return new Promise((resolve) => Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), () => resolve(null)));
}

function encodedSize(base64: string) {
  const value = base64.replace(/^data:[^,]*,/, '');
  return Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

function optimizedName(name: string, mime: string) {
  if (mime !== 'image/jpeg') return name;
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, '.jpg') : `${name}.jpg`;
}

async function imageAttachment(asset: NativeFileAsset, sessionId?: string | null): Promise<Attachment> {
  const originalMime = imageMime(asset);
  const preserveAnimation = originalMime === 'image/gif';
  let uri = asset.uri;
  let mime = originalMime;
  let name = assetName(asset, 'image');
  let encoded = asset.base64 || '';
  let size = Number(asset.fileSize || asset.size || 0);

  if (!preserveAnimation) {
    const sizeHint = await dimensions(asset.uri, asset.width, asset.height);
    const scale = sizeHint ? Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sizeHint.width, sizeHint.height)) : 1;
    const actions = sizeHint && scale < 1
      ? [{ resize: { width: Math.round(sizeHint.width * scale), height: Math.round(sizeHint.height * scale) } }]
      : [];
    const format = originalMime === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG;
    const result = await manipulateAsync(asset.uri, actions, { compress: IMAGE_QUALITY, format, base64: true });
    uri = result.uri;
    encoded = result.base64 || '';
    mime = format === SaveFormat.PNG ? 'image/png' : 'image/jpeg';
    name = optimizedName(name, mime);
    size = encoded ? encodedSize(encoded) : size;
  }
  if (size > MAX_FILE_BYTES) throw new Error(tSync('chat.fileTooLarge'));

  /* /api/files is the same authenticated storage API used by Web and document
   * attachments. Always persist the image so it remains addressable in history. */
  const uploaded = await filesApi.upload({ uri, name, mimeType: mime, size }, sessionId || undefined);
  const rawBase64 = encoded.replace(/^data:[^,]*,/, '');
  const dataUrl = rawBase64 && rawBase64.length <= MAX_IMAGE_DATA_URL_CHARS
    ? `data:${mime};base64,${rawBase64}`
    : undefined;
  return {
    id: uploaded.id,
    fileId: uploaded.id,
    kind: 'image',
    name: uploaded.name || name,
    mime: uploaded.mimeType || mime,
    ...(dataUrl ? { dataUrl } : {}),
    size: uploaded.size || size,
  };
}

async function documentAttachment(asset: NativeFileAsset, sessionId?: string | null): Promise<Attachment> {
  const uploaded = await filesApi.upload({
    uri: asset.uri,
    name: assetName(asset, 'attachment'),
    mimeType: asset.mimeType,
    size: asset.size || asset.fileSize,
  }, sessionId || undefined);
  let content: Awaited<ReturnType<typeof filesApi.content>> | null = null;
  try {
    content = await filesApi.content(uploaded.id);
  } catch {
    // Binary files without a text extractor still remain available as a
    // library attachment; the chip communicates that they were uploaded.
  }
  return {
    id: uploaded.id,
    fileId: uploaded.id,
    kind: uploaded.kind,
    name: uploaded.name,
    mime: uploaded.mimeType,
    size: uploaded.size,
    text: content?.text || undefined,
    truncated: content?.truncated,
    docKind: content?.kind || uploaded.kind,
  };
}

export type ChatAttachmentSource = 'file' | 'image' | 'camera';

/** Pick one native asset and normalize it into the persisted chat contract. */
export async function pickChatAttachment(source: ChatAttachmentSource, sessionId?: string | null) {
  const result = source === 'file'
    ? await native.pickFile()
    : source === 'image'
      ? await native.pickImage()
      : await native.capturePhoto();
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  const assetSize = Number(asset.fileSize || asset.size || 0);
  if (assetSize > MAX_FILE_BYTES) throw new Error(tSync('chat.fileTooLarge'));
  const imageName = (asset.name || asset.fileName || '').toLowerCase();
  const isImageFile = asset.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/.test(imageName);
  if (source !== 'file' || isImageFile || asset.base64) return imageAttachment(asset, sessionId);
  return documentAttachment(asset, sessionId);
}
