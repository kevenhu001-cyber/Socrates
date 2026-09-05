import { createImmutableBridge, useBridge } from '../../lib/bridge/index.ts';
import type { ComposerSurface } from '../composer-input/controller';
import type { PluginCatalogEntry } from './pluginCatalog';

export interface ComposerPluginSelection {
  id: string;
  name: string;
  description: string;
  capabilities: ReadonlyArray<string>;
  directiveTemplate?: string;
  iconMarkup: string;
}

export interface ComposerPluginSelectionSnapshot {
  topic: ReadonlyArray<ComposerPluginSelection>;
  chat: ReadonlyArray<ComposerPluginSelection>;
  revision: number;
}

export interface ComposerPluginSelectionBridge {
  getSnapshot: () => ComposerPluginSelectionSnapshot;
  publish: (snapshot: Omit<ComposerPluginSelectionSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: ComposerPluginSelectionAction) => void;
  flush: () => void;
  __resetForTests: () => void;
}

export type ComposerPluginSelectionAction =
  | { type: 'toggle'; surface: ComposerSurface; plugin: ComposerPluginSelection }
  | { type: 'remove'; surface: ComposerSurface; id: string }
  | { type: 'replace'; surface: ComposerSurface; plugins: ReadonlyArray<ComposerPluginSelection> }
  | { type: 'clear'; surface: ComposerSurface };

const EMPTY: ReadonlyArray<ComposerPluginSelection> = Object.freeze([]);
const INITIAL: ComposerPluginSelectionSnapshot = Object.freeze({
  topic: EMPTY,
  chat: EMPTY,
  revision: 0,
});

type ReducerAction = ComposerPluginSelectionAction;

function freezePlugins(plugins: ReadonlyArray<ComposerPluginSelection>): ReadonlyArray<ComposerPluginSelection> {
  return Object.freeze(plugins.map((plugin) => Object.freeze({
    ...plugin,
    capabilities: Object.freeze([...(plugin.capabilities || [])]),
  })));
}

const factoryBridge = createImmutableBridge<ComposerPluginSelectionSnapshot, ReducerAction>({
  initial: INITIAL,
  reducer: (state, action) => {
    const current = [...state[action.surface]];
    if (action.type === 'toggle') {
      const existing = current.findIndex((plugin) => plugin.id === action.plugin.id);
      if (existing >= 0) current.splice(existing, 1);
      else current.push(action.plugin);
    } else if (action.type === 'remove') {
      const next = current.filter((plugin) => plugin.id !== action.id);
      return {
        ...state,
        [action.surface]: freezePlugins(next),
      };
    } else if (action.type === 'replace') {
      return {
        ...state,
        [action.surface]: freezePlugins(action.plugins),
      };
    } else if (action.type === 'clear') {
      return {
        ...state,
        [action.surface]: EMPTY,
      };
    }
    return {
      ...state,
      [action.surface]: freezePlugins(current),
    };
  },
});

const bridge: ComposerPluginSelectionBridge = Object.assign(factoryBridge, {
  publish: (snapshot: Omit<ComposerPluginSelectionSnapshot, 'revision'>) => {
    factoryBridge.dispatch({ type: 'replace', surface: 'topic', plugins: snapshot.topic });
    factoryBridge.dispatch({ type: 'replace', surface: 'chat', plugins: snapshot.chat });
  },
}) as ComposerPluginSelectionBridge;

export function installComposerPluginSelectionBridge(): ComposerPluginSelectionBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesComposerPluginSelectionBridge) {
      window.__socratesComposerPluginSelectionBridge = bridge;
    }
    return window.__socratesComposerPluginSelectionBridge;
  }
  return bridge;
}

export function getComposerPluginSelectionSnapshot(): ComposerPluginSelectionSnapshot {
  return installComposerPluginSelectionBridge().getSnapshot();
}

export function useComposerPluginSelectionSnapshot(): ComposerPluginSelectionSnapshot {
  return useBridge(factoryBridge);
}

export function selectedComposerPlugins(surface: ComposerSurface): ReadonlyArray<ComposerPluginSelection> {
  return getComposerPluginSelectionSnapshot()[surface];
}

export function toggleComposerPlugin(surface: ComposerSurface, entry: PluginCatalogEntry, iconMarkup = ''): void {
  installComposerPluginSelectionBridge().dispatch({
    type: 'toggle',
    surface,
    plugin: {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      capabilities: entry.capabilities,
      directiveTemplate: entry.directiveTemplate,
      iconMarkup,
    },
  });
}

export function removeComposerPlugin(surface: ComposerSurface, id: string): void {
  installComposerPluginSelectionBridge().dispatch({ type: 'remove', surface, id });
}

export function clearComposerPlugins(surface: ComposerSurface): void {
  installComposerPluginSelectionBridge().dispatch({ type: 'clear', surface });
}

export function copyComposerPlugins(from: ComposerSurface, to: ComposerSurface): void {
  installComposerPluginSelectionBridge().dispatch({
    type: 'replace',
    surface: to,
    plugins: getComposerPluginSelectionSnapshot()[from],
  });
}

/* The legacy navigation module can restore an OAuth return context before
   the first Composer React render commits. Register the same singleton at
   module evaluation time so that early page restoration never falls into a
   no-op just because the hook has not subscribed yet. */
if (typeof window !== 'undefined') {
  installComposerPluginSelectionBridge();
}

declare global {
  interface Window {
    __socratesComposerPluginSelectionBridge?: ComposerPluginSelectionBridge;
  }
}
