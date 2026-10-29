import { createElement, createRef } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { Textarea } from '../ui/shadcn/textarea';

export function copyTextWithShadcnTextarea(value: string): Promise<void> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.className = 'fixed left-[-10000px] top-0 size-1 overflow-hidden opacity-0';
  document.body.appendChild(host);
  const ref = createRef<HTMLTextAreaElement>();
  const focused = document.activeElement;
  let root!: ReturnType<typeof mountOwnedRoot>;
  try {
    flushSync(() => {
      root = mountOwnedRoot(host, 'clipboard-textarea', createElement(Textarea, {
        ref,
        defaultValue: value,
        readOnly: true,
        tabIndex: -1,
        className: 'h-1 min-h-0 w-1 resize-none p-0',
      }));
    });
    const textarea = ref.current;
    if (!textarea) throw new Error('clipboard textarea did not mount');
    textarea.value = value;
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('copy failed');
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  } finally {
    root.destroy();
    host.remove();
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
  }
}
