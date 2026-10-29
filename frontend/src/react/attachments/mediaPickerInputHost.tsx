import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { MediaPickerInput } from './MediaPickerInput';

export function createAttachmentMediaInput(props: {
  id: string;
  accept: string;
  capture?: boolean | 'user' | 'environment';
  multiple: boolean;
  onChange(files: File[]): void;
}): { host: HTMLDivElement; input: HTMLInputElement } {
  const host = document.createElement('div');
  host.dataset.reactSurface = 'attachment-media-input';
  host.className = 'attachment-media-input-host';
  flushSync(() => {
    mountOwnedRoot(host, 'attachment-media-input', createElement(MediaPickerInput, props));
  });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Attachment media input did not mount.');
  return { host, input };
}
