import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { PickerMenu, type PickerExtensionItem, type PickerProviderItem } from './PickerMenu';

const roots = new WeakMap<HTMLElement, OwnedRootHandle>();

function renderPickerMenu(host: HTMLElement, props: Parameters<typeof PickerMenu>[0]): void {
  const content = createElement(PickerMenu, props);
  const existing = roots.get(host);
  if (existing) flushSync(() => existing.render(content));
  else flushSync(() => roots.set(host, mountOwnedRoot(host, 'picker-menu', content)));
}

export function renderModelPickerMenu(
  host: HTMLElement,
  providers: PickerProviderItem[],
  activeId: string | undefined,
  addLabel?: string,
): void {
  renderPickerMenu(host, { mode: 'models', providers, activeId, addLabel });
}

export function renderPickerLoading(host: HTMLElement): void {
  renderPickerMenu(host, { mode: 'loading' });
}

export function renderExtensionPickerMenu(host: HTMLElement, extensions: PickerExtensionItem[]): void {
  renderPickerMenu(host, { mode: 'extensions', extensions });
}
