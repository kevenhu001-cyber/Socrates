import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../react/lib/boot/ownedRoot';
import { MessageEditForm } from '../react/message-list/MessageEditForm';

export function mountMessageEditForm(host: HTMLElement, props: {
  initialText: string;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onCommit: (text: string) => void;
}): () => void {
  let handle: ReturnType<typeof mountOwnedRoot> | null = null;
  flushSync(() => { handle = mountOwnedRoot(host, 'message-edit-form', createElement(MessageEditForm, props)); });
  return () => handle?.destroy();
}
