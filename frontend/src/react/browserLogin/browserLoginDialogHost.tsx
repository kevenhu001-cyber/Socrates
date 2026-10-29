import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { BrowserLoginDialog, type BrowserLoginDialogProps } from './BrowserLoginDialog';

export function mountBrowserLoginDialog(host: HTMLElement, props: BrowserLoginDialogProps): OwnedRootHandle {
  let root: OwnedRootHandle | null = null;
  flushSync(() => { root = mountOwnedRoot(host, 'browser-login-dialog', createElement(BrowserLoginDialog, props)); });
  return root!;
}

export function renderBrowserLoginDialog(root: OwnedRootHandle, props: BrowserLoginDialogProps): void {
  flushSync(() => root.render(createElement(BrowserLoginDialog, props)));
}
