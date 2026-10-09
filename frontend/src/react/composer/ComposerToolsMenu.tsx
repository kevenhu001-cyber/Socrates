import { clearHostMounted, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';

import {
  getActiveTemplateExtensionKey,
  isDeepResearchOn,
  isExtensiveThinkingOn,
  isWebSearchOn,
} from '../legacy/gateway.ts';
import { installComposerToolsBridge, useComposerToolsDispatch, useComposerToolsSnapshot } from './composerTools.bridge';
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

let composerToolsMenuMounted = false;

export function hydrateComposerToolsMenu(): ComposerToolsHandle | null {
  const menu = document.getElementById(MENU_ID);
  if (!menu) return null;
  /* The registry marks the host at dispatch time, before this lazy import
     resolves, so a module flag prevents duplicate React roots. */
  if (composerToolsMenuMounted) return null;
  composerToolsMenuMounted = true;

  installComposerToolsBridge();
  const root = createRoot(menu);
  root.render(<ComposerToolsMenu />);
  markHostMountedBy(menu, 'composer-tools-menu');
  return {
    menu,
    root,
    destroy: () => {
      root.unmount();
      composerToolsMenuMounted = false;
      clearHostMounted(menu);
    },
  };
}
