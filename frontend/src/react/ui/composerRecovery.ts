import {
  getComposerMarkdown,
  notifyComposerChange,
  readComposerSurface,
  registerComposer,
} from '../../composer/controller.ts';
import { composerLifecycleStore } from '../../composer/lifecycle.store.ts';
import { submitComposer } from '../composer-input/lifecycle';
import { getLegacyActions } from '../legacy/gateway';
import { i18n } from '../../ui/legacyI18n.ts';

const basicComposers = new WeakMap<HTMLElement, () => void>();

export function releaseBasicComposer(host: HTMLElement): void {
  basicComposers.get(host)?.();
}

/** Keep the primary input usable while the rich editor is unavailable.
 * This adapter intentionally uses native DOM so it has no editor/UI dependency. */
export function mountBasicComposer(host: HTMLElement): () => void {
  const existing = basicComposers.get(host);
  if (existing) return existing;
  const doc = host.ownerDocument;
  const field = doc.createElement('textarea');
  field.className = 'msg-edit-area';
  field.dataset.basicComposer = 'true';
  field.setAttribute(
    'aria-label',
    i18n('topic.inputPlaceholder', 'What would you like to explore?'),
  );
  field.value = getComposerMarkdown(readComposerSurface());
  const send = doc.createElement('button');
  send.type = 'button';
  send.className = 'btn btn-ghost btn-touch';
  send.textContent = i18n('chat.send', 'Send');
  const token = () => composerLifecycleStore.getState().extensionTokens[readComposerSurface()];
  const update = () => notifyComposerChange(readComposerSurface(), field.value);
  const submit = () => {
    update();
    submitComposer(getLegacyActions().composer);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      submit();
    }
  };
  const unregister = registerComposer(readComposerSurface(), {
    getMarkdown: () => field.value,
    setMarkdown: (value) => {
      field.value = value;
    },
    insertText: (value) => {
      field.setRangeText(value, field.selectionStart, field.selectionEnd, 'end');
      update();
    },
    clear: () => {
      field.value = '';
    },
    getExtensionToken: token,
    setExtensionToken: () => undefined,
    focus: () => field.focus({ preventScroll: true }),
    getSelection: () => ({ from: field.selectionStart, to: field.selectionEnd }),
    isVisible: () => field.isConnected && host.offsetParent !== null,
  });
  const unsubscribe = composerLifecycleStore.subscribe((state) => {
    if (field.value !== state.drafts[state.surface]) field.value = state.drafts[state.surface];
  });
  field.addEventListener('input', update);
  field.addEventListener('keydown', keydown);
  send.addEventListener('click', submit);
  host.append(field, send);
  const release = () => {
    if (basicComposers.get(host) !== release) return;
    basicComposers.delete(host);
    unregister();
    unsubscribe();
    field.removeEventListener('input', update);
    field.removeEventListener('keydown', keydown);
    send.removeEventListener('click', submit);
    field.remove();
    send.remove();
  };
  basicComposers.set(host, release);
  return release;
}
