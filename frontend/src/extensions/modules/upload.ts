// frontend/src/extensions/modules/upload.ts

import type { ExtensionDefinition } from '../types';

export const UPLOAD_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.7 9.7a2 2 0 0 1-2.8-2.8l9-9"/></svg>';

export const uploadExtension: ExtensionDefinition = {
  key: 'upload',
  kind: 'action',
  nameKey: 'composer.menu.upload',
  nameFallback: 'Add files',
  descriptionKey: 'composer.menu.uploadHint',
  descriptionFallback: 'Images, PDFs, notes and data',
  hintKey: 'composer.menu.uploadHint',
  hintFallback: 'Images, PDFs, notes and data',
  icon: UPLOAD_ICON,
  placement: { tools: 1 },
  onActivate(ctx) {
    ctx.openAttachmentPicker?.(ctx.surface);
  },
};
