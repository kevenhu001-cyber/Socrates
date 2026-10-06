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

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);

function isImageAsset(asset: NativeFileAsset): boolean {
  if (asset.mimeType?.toLowerCase().startsWith('image/')) return true;
  const name = asset.name || asset.fileName || '';
  const ext = (name.toLowerCase().split('.').pop() || '').trim();
  return IMAGE_EXTENSIONS.has(ext);
}

async function imageAttachment(asset: NativeFileAsset, sessionId?: string | null): Promise<Attachment> {
  const mime = imageMime(asset);
  const encoded = asset.base64 || '';
  if (!encoded) throw new Error(tSync('chat.imageReadFailed'));
  // Estimate the dataUrl length BEFORE allocating the concatenated string:
  // a ~1.5 MB base64 payload already expands past the server's 2M-char
  // image_url cap, and building the string first would peak memory.
  const prefixLen = encoded.startsWith('data:') ? 0 : `data:${mime};base64,`.length;
  if (encoded.length + prefixLen > MAX_IMAGE_DATA_URL_CHARS) throw new Error(tSync('chat.imageTooLarge'));
  const dataUrl = encoded.startsWith('data:') ? encoded : `data:${mime};base64,${encoded}`;
  const attachment: Attachment = {
    id: id('image'),
    kind: 'image',
    name: assetName(asset, 'image'),
    mime,
    dataUrl,
    size: asset.fileSize || asset.size || 0,
  };
  // Durable copy: web uploads every file AND keeps the inline dataUrl for
  // multimodal turns. Without a fileId the image vanishes after reload
  // (no re-read via read_attachment). Best-effort — an upload failure
  // keeps the inline-only fallback for this turn.
  if (asset.uri) {
    try {
      const uploaded = await filesApi.upload({
        uri: asset.uri,
        name: assetName(asset, 'image'),
        mimeType: mime,
        size: asset.size || asset.fileSize,
      }, sessionId || undefined);
      attachment.id = uploaded.id;
      (attachment as { fileId?: string }).fileId = uploaded.id;
    } catch {
      // Inline-only fallback stays usable for this turn.
    }
  }
  return attachment;
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
  // Classify by source + type/extension — never by base64 presence
  // (DocumentPicker assets carry no base64, but a future picker change
  // must not turn a PDF into a corrupt image/jpeg).
  if (source !== 'file' || isImageAsset(asset)) return imageAttachment(asset, sessionId);
  return documentAttachment(asset, sessionId);
}
