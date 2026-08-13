import type { Attachment } from '@socrates/contracts';
import { filesApi } from '../api/client';
import { native, type NativeFileAsset } from '../../native/native';
import { tSync } from '../../i18n';

const MAX_IMAGE_DATA_URL_CHARS = 1_900_000;

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

function imageAttachment(asset: NativeFileAsset): Attachment {
  const mime = imageMime(asset);
  const encoded = asset.base64 || '';
  if (!encoded) throw new Error(tSync('chat.imageReadFailed'));
  const dataUrl = encoded.startsWith('data:') ? encoded : `data:${mime};base64,${encoded}`;
  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) throw new Error(tSync('chat.imageTooLarge'));
  return {
    id: id('image'),
    kind: 'image',
    name: assetName(asset, 'image'),
    mime,
    dataUrl,
    size: asset.fileSize || asset.size || 0,
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
  if (source !== 'file' || asset.mimeType?.startsWith('image/') || asset.base64) return imageAttachment(asset);
  return documentAttachment(asset, sessionId);
}
