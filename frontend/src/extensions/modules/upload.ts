import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/upload.ts

import type { ExtensionDefinition } from '../types';

export const UPLOAD_ICON = interfaceIcon('paperclip', 18);

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
