// frontend/src/extensions/modules/upload.ts

import type { ExtensionDefinition } from '../types';

export const UPLOAD_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>';

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
