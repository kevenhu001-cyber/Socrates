import { useSyncExternalStore } from 'react';
import { installComposerPluginSelectionBridge } from '../../composer/pluginSelection.ts';

const selection = installComposerPluginSelectionBridge();

/** Subscribe React to the same domain store used by chat and navigation. */
export function useComposerPluginSelectionSnapshot() {
  return useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot);
}
