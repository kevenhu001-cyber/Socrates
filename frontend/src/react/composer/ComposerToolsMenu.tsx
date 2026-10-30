import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { Root } from 'react-dom/client';

import {
  getActiveTemplateExtensionKey,
  isDeepResearchOn,
  isExtensiveThinkingOn,
  isWebSearchOn,
} from '../legacy/gateway.ts';
import { useComposerToolsDispatch, useComposerToolsSnapshot } from './composerTools.store';
import { ComposerToolMenuItems } from './ComposerToolMenuItems';

const MENU_ID = 'composerToolsMenu';

function ComposerToolsMenu() {
  const snapshot = useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();
  const activeKey = getActiveTemplateExtensionKey()
    ?? (isWebSearchOn() ? 'webSearch' : null)
    ?? (isDeepResearchOn() ? 'deepResearch' : null)
    ?? (isExtensiveThinkingOn() ? 'extensiveThinking' : null);

  return (
    <ComposerToolMenuItems
      activeKey={activeKey}
      onPick={pick}
      isOpen={snapshot.isOpen}
      mode={snapshot.mode}
    />
  );
}

export interface ComposerToolsHandle {
  menu: HTMLElement;
  root: Root;
  destroy: () => void;
}

export function hydrateComposerToolsMenu(): ComposerToolsHandle | null {
  const menu = document.getElementById(MENU_ID);
  if (!menu) return null;
  return { menu, ...mountOwnedRoot(menu, 'composer-tools-menu', <ComposerToolsMenu />) };
}
