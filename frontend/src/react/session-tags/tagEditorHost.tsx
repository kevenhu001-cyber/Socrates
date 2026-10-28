import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { TagEditorPopover, type TagEditorPopoverProps } from './TagEditorPopover';

let activeRoot: OwnedRootHandle | null = null;

/**
 * Renders the tag editor into its singleton shell. The shell itself is created
 * and positioned by `session/organize.ts`; re-rendering keeps the same React
 * tree so the draft text and focus survive a tag add/remove.
 */
export function renderTagEditor(host: HTMLElement, props: TagEditorPopoverProps): void {
  const element = <TagEditorPopover {...props} />;
  if (activeRoot) {
    activeRoot.render(element);
    return;
  }
  flushSync(() => {
    activeRoot = mountOwnedRoot(host, 'session-tag-editor', element);
  });
}

export function unmountTagEditor(): void {
  const root = activeRoot;
  if (!root) return;
  activeRoot = null;
  root.destroy();
}
