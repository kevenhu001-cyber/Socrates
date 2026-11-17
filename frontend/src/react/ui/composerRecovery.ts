import {
  getComposerMarkdown,
  notifyComposerChange,
  readComposerSurface,
  registerComposer,
} from '../../composer/controller.ts';
import { composerLifecycleStore } from '../../composer/lifecycle.store.ts';
import { submitComposer } from '../composer-input/lifecycle';
import { getLegacyActions, i18n } from '../legacy/gateway';

/** Keep the primary input usable when the rich editor's chunk cannot load.
 * This adapter intentionally uses native DOM so it has no editor/UI dependency. */
export function mountBasicComposer(host: HTMLElement): () => void {
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
  return () => {
    unregister();
    unsubscribe();
    field.removeEventListener('input', update);
    field.removeEventListener('keydown', keydown);
    send.removeEventListener('click', submit);
    field.remove();
    send.remove();
  };
}
