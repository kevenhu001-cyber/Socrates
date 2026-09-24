import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { getLegacyGlobalValue, t as _t } from '../legacy/gateway';
import { repositionComposerTools } from '../../ui/composerTools';
import { installComposerToolsBridge } from './composerTools.bridge';
import {
  useComposerToolsDispatch,
  useComposerToolsSnapshot,
} from './composerTools.bridge';
import { registry } from '../../extensions/registry';
import { extensiveThinkingExtension } from '../../extensions/modules/extensiveThinking';
import type { ExtensionDefinition } from '../../extensions/types';
import type { ComposerToolsAction } from './types';
import { loadPluginCatalog, pluginIconMarkup, type PluginCatalogEntry } from './pluginCatalog';
import {
  useComposerPluginSelectionSnapshot,
  toggleComposerPlugin,
} from './pluginSelection';

const MENU_ID = 'composerToolsMenu';

type MenuItemSpec = ExtensionDefinition;

/* Labels go through the i18n pipeline like every other menu in the app. The
   first layer intentionally mirrors ChatGPT's compact composer menu: media
   actions stay together and workflows live behind one explicit disclosure.
   `labelKey` is resolved at render time so setLang() repaints the menu with
   the rest of the chrome. */
const MOBILE_MENU_ICON_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

const MOBILE_MENU_ITEMS: ReadonlyArray<{
  action: 'camera' | 'photos';
  labelKey: string;
  label: string;
  icon: string;
}> = [
  {
    action: 'camera',
    labelKey: 'composer.tools.camera',
    label: 'Camera',
    icon: MOBILE_MENU_ICON_OPEN + '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  },
  {
    action: 'photos',
    labelKey: 'composer.tools.photos',
    label: 'Photos',
    icon: MOBILE_MENU_ICON_OPEN + '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  },
];

const TOOL_GROUPS: ReadonlyArray<{
  key: string;
  labelKey: string;
  label: string;
  actions: ReadonlyArray<string>;
}> = [
  {
    key: 'context',
    labelKey: 'composer.tools.group.context',
    label: 'Add context',
    actions: ['upload'],
  },
  {
    key: 'research',
    labelKey: 'composer.tools.group.research',
    label: 'Search & research',
    actions: ['webSearch', 'explore'],
  },
  {
    key: 'create',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['write', 'analyze', 'createImage', 'exam', 'skills'],
  },
];

const MOBILE_THINKING_SPEC: MenuItemSpec = {
  ...extensiveThinkingExtension,
  nameKey: 'composer.tools.thinkDeeper',
  nameFallback: 'Think deeper',
};

function toolDefinitions(): MenuItemSpec[] {
  return registry.byPlacement('tools');
}

function i18n(key: string, fallback: string): string {
  const value = _t(key);
  return value !== key ? value : fallback;
}

function menuCopy(spec: MenuItemSpec): { label: string; description: string } {
  const label = i18n(spec.nameKey, spec.nameFallback);
  const description = spec.descriptionKey
    ? i18n(spec.descriptionKey, spec.descriptionFallback ?? '')
    : '';
  return { label, description };
}

function MenuItem({
  spec,
  active,
  onPick,
}: {
  spec: MenuItemSpec;
  active: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const { label, description } = menuCopy(spec);

  return (
    <button
      type="button"
      className={`composer-tools-item${active ? ' is-active' : ''}`}
      role="menuitem"
      data-composer-action={spec.key}
      aria-label={description ? `${label}: ${description}` : label}
      aria-pressed={spec.kind === 'toggle' ? active : undefined}
      aria-keyshortcuts={spec.shortcut || undefined}
      onClick={(event) => {
        event.stopPropagation();
        onPick(spec.key as ComposerToolsAction);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span className="composer-tools-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      {spec.shortcut ? <kbd>{spec.shortcut}</kbd> : null}
      {active ? <span className="composer-tools-active-dot" aria-hidden="true" /> : null}
    </button>
  );
}

function MobileMenuItem({
  action,
  labelKey,
  label,
  icon,
  active,
  onPick,
}: (typeof MOBILE_MENU_ITEMS)[number] & {
  active: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const text = i18n(labelKey, label);
  return (
    <button
      type="button"
      className={`composer-tools-item composer-tools-mobile-item${active ? ' is-active' : ''}`}
      role="menuitem"
      data-composer-action={action}
      aria-label={text}
      onClick={(event) => {
        event.stopPropagation();
        onPick(action);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="composer-tools-copy"><span>{text}</span></span>
      {active ? (
        <svg className="composer-tools-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      ) : null}
    </button>
  );
}

function PluginMark({ plugin }: { plugin: PluginCatalogEntry }) {
  const markup = pluginIconMarkup(plugin.id);
  if (markup) {
    return <span className="composer-plugin-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
  }
  return <span className="composer-plugin-mark composer-plugin-mark-fallback" aria-hidden="true">{plugin.name.slice(0, 2).toUpperCase()}</span>;
}

function ComposerPluginItem({
  plugin,
  selected,
  onPick,
}: {
  plugin: PluginCatalogEntry;
  selected: boolean;
  onPick: (plugin: PluginCatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      className={`composer-tools-plugin-item${selected ? ' is-selected' : ''}`}
      data-composer-plugin={plugin.id}
      role="menuitem"
      aria-pressed={selected}
      aria-label={`${plugin.name}${selected ? ': added' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onPick(plugin);
      }}
    >
      <PluginMark plugin={plugin} />
      <span className="composer-tools-plugin-name">{plugin.name}</span>
      {selected ? (
        <svg className="composer-tools-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      ) : null}
    </button>
  );
}

/* Only connected plugins appear in the composer menu — the reference list is
   a roster of the apps the user already configured, never a directory with
   connect prompts (that stays in the Plugin Center). */
function PluginItems({
  isOpen,
  mode,
  query,
  onPick,
}: {
  isOpen: boolean;
  mode: 'topic' | 'chat' | null;
  query: string;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const [plugins, setPlugins] = useState<ReadonlyArray<PluginCatalogEntry>>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPlugins = mode ? selectionSnapshot[mode] : [];

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setLoadState('loading');
    loadPluginCatalog()
      .then((entries) => {
        if (!cancelled) {
          setPlugins(entries);
          setLoadState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const connectedPlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (plugin.connectionStatus !== 'connected') return false;
      if (!normalized) return true;
      return [plugin.name, plugin.description, ...plugin.capabilities]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [plugins, query]);

  const togglePlugin = (plugin: PluginCatalogEntry) => {
    if (!mode) return;
    toggleComposerPlugin(mode, plugin, pluginIconMarkup(plugin.id));
  };

  const connectedCount = plugins.filter((plugin) => plugin.connectionStatus === 'connected').length;
  const retry = () => {
    setLoadState('loading');
    loadPluginCatalog(true)
      .then((entries) => {
        setPlugins(entries);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  };

  const managePlugins = () => onPick('managePlugins');

  return (
    <section className="composer-tools-plugins" aria-label={i18n('composer.tools.connectedApps', 'Connected apps')}>
      <div className="composer-tools-group-label">{i18n('composer.tools.connectedApps', 'Connected apps')}</div>
      {loadState === 'loading' || loadState === 'idle' ? (
        <div className="composer-tools-plugin-state" role="status">{i18n('composer.tools.plugins.loading', 'Loading connected apps…')}</div>
      ) : null}
      {loadState === 'error' ? (
        <div className="composer-tools-plugin-state" role="status">
          <span>{i18n('composer.tools.plugins.error', 'Connected apps could not be loaded.')}</span>
          <button
            type="button"
            className="composer-tools-state-action"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              retry();
            }}
          >
            {i18n('composer.tools.plugins.retry', 'Try again')}
          </button>
        </div>
      ) : null}
      {loadState === 'ready' && connectedPlugins.length > 0 ? (
        <div className="composer-tools-plugin-list">
          {connectedPlugins.map((plugin) => (
            <ComposerPluginItem
              key={plugin.id}
              plugin={plugin}
              selected={selectedPlugins.some((selectedPlugin) => selectedPlugin.id === plugin.id)}
              onPick={togglePlugin}
            />
          ))}
        </div>
      ) : null}
      {loadState === 'ready' && connectedCount === 0 ? (
        <div className="composer-tools-plugin-state">
          <span>{i18n('composer.tools.plugins.empty', 'No connected apps yet.')}</span>
          <small>{i18n('composer.tools.plugins.emptyHint', 'Connect an app to add its context to a chat.')}</small>
          <button type="button" className="composer-tools-state-action" role="menuitem" onClick={managePlugins}>
            {i18n('composer.tools.plugins.manage', 'Manage apps')}
          </button>
        </div>
      ) : null}
      {loadState === 'ready' && connectedCount > 0 && connectedPlugins.length === 0 ? (
        <div className="composer-tools-plugin-state" role="status">
          <span>{i18n('composer.tools.plugins.noMatch', 'No connected apps match this search.')}</span>
          <button type="button" className="composer-tools-state-action" role="menuitem" onClick={managePlugins}>
            {i18n('composer.tools.plugins.manage', 'Manage apps')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function MenuItems({
  activeKey,
  onPick,
  isOpen,
  mode,
}: {
  activeKey: string | null;
  onPick: (action: ComposerToolsAction) => void;
  isOpen: boolean;
  mode: 'topic' | 'chat' | null;
}) {
  const [query, setQuery] = useState('');
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPluginCount = mode ? selectionSnapshot[mode].length : 0;

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(() => repositionComposerTools());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, query, selectedPluginCount]);

  const definitions = toolDefinitions();
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (spec: MenuItemSpec): boolean => {
    if (!normalizedQuery) return true;
    const { label, description } = menuCopy(spec);
    return [label, description, spec.key].join(' ').toLowerCase().includes(normalizedQuery);
  };
  const footerPlaceholder = i18n('composer.tools.searchFooter', 'Search tools and connected apps');
  const mobileStaticItems = MOBILE_MENU_ITEMS.filter((item) => {
    if (!normalizedQuery) return true;
    return [i18n(item.labelKey, item.label), item.action].join(' ').toLowerCase().includes(normalizedQuery);
  });
  const groups = TOOL_GROUPS.map((group) => ({
    ...group,
    label: i18n(group.labelKey, group.label),
    tools: group.actions
      .map((key) => definitions.find((spec) => spec.key === key))
      .filter((spec): spec is MenuItemSpec => Boolean(spec))
      .filter(matchesQuery),
  }));
  const mobileGroupTools = groups.map((group) => ({
    ...group,
    tools: group.key === 'create'
      ? [...group.tools, ...(matchesQuery(MOBILE_THINKING_SPEC) ? [MOBILE_THINKING_SPEC] : [])]
      : group.tools,
  }));
  const hasMobileToolMatch = mobileStaticItems.length > 0 || mobileGroupTools.some((group) => group.tools.length > 0);

  return (
    <>
      <div className="composer-tools-desktop-items composer-tools-expanded">
        {groups.map((group) => group.tools.length ? (
          <div className="composer-tools-group" role="group" aria-label={group.label} key={group.key}>
            <div className="composer-tools-group-label">{group.label}</div>
            {group.tools.map((spec) => (
              <MenuItem key={spec.key} spec={spec} active={spec.key === activeKey} onPick={onPick} />
            ))}
          </div>
        ) : null)}
        {normalizedQuery && groups.every((group) => group.tools.length === 0) ? (
          <div className="composer-tools-plugin-state" role="status">{i18n('composer.tools.noMatch', 'No matching actions.')}</div>
        ) : null}
      </div>
      <div className="composer-tools-mobile-items">
        {mobileGroupTools.map((group) => {
          const staticItems = group.key === 'context'
            ? mobileStaticItems.filter((item) => item.action === 'camera' || item.action === 'photos')
            : [];
          const tools = group.tools;
          if (!staticItems.length && !tools.length) return null;
          return (
            <div className="composer-tools-group" role="group" aria-label={group.label} key={group.key}>
              <div className="composer-tools-group-label">{group.label}</div>
              {staticItems.map((item) => (
                <MobileMenuItem key={item.action} {...item} active={item.action === activeKey} onPick={onPick} />
              ))}
              {tools.map((spec) => (
                <MenuItem key={spec.key} spec={spec} active={spec.key === activeKey} onPick={onPick} />
              ))}
            </div>
          );
        })}
        {normalizedQuery && !hasMobileToolMatch ? (
          <div className="composer-tools-plugin-state" role="status">{i18n('composer.tools.noMatch', 'No matching actions.')}</div>
        ) : null}
      </div>
      <PluginItems isOpen={isOpen} mode={mode} query={query} onPick={onPick} />
      <label className="composer-tools-footer-search composer-tools-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={footerPlaceholder}
          aria-label={footerPlaceholder}
        />
      </label>
    </>
  );
}

function ComposerToolsMenu() {
  const snapshot = useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();
  const activeTemplate = getLegacyGlobalValue('_activeTemplate', null as { extensionKey?: string } | null);
  const webSearchOn = getLegacyGlobalValue('webSearchOn', false);
  const extensiveThinkingOn = getLegacyGlobalValue('extensiveThinkingOn', false);
  const activeKey = activeTemplate?.extensionKey
    ?? (webSearchOn ? 'webSearch' : null)
    ?? (extensiveThinkingOn ? 'extensiveThinking' : null);

  return <MenuItems activeKey={activeKey} onPick={pick} isOpen={snapshot.isOpen} mode={snapshot.mode} />;
}

export interface ComposerToolsHandle {
  menu: HTMLElement;
  root: Root;
  destroy: () => void;
}

export function hydrateComposerToolsMenu(): ComposerToolsHandle | null {
  const menu = document.getElementById(MENU_ID);
  if (!menu) return null;
  if (hostIsMountedBy(menu, 'composer-tools-menu')) {
    throw new Error('Composer tools menu React runtime was initialized more than once.');
  }

  installComposerToolsBridge();

  const root = createRoot(menu);
  root.render(<ComposerToolsMenu />);
  markHostMountedBy(menu, 'composer-tools-menu');
  return {
    menu,
    root,
    destroy: () => {
      root.unmount();
      clearHostMounted(menu);
    },
  };
}
