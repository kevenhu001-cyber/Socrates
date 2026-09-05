import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { getLegacyActions, t as _t } from '../legacy/gateway';
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
const MOBILE_MENU_ITEMS: ReadonlyArray<{
  action: ComposerToolsAction;
  labelKey: string;
  label: string;
  icon: string;
}> = [
  {
    action: 'camera',
    labelKey: 'composer.tools.camera',
    label: 'Camera',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7.5h3l1.4-2h7.2l1.4 2h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>',
  },
  {
    action: 'photos',
    labelKey: 'composer.tools.photos',
    label: 'Photos',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="15.5" cy="9" r="1.5"/><path d="m5.5 17 4.2-4.5 3.1 3 2.1-2 3.6 3.5"/></svg>',
  },
  {
    action: 'upload',
    labelKey: 'composer.tools.files',
    label: 'Files',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7 7a5 5 0 0 1-7.1-7.1l7.2-7.2"/><path d="m7.1 14 7-7"/></svg>',
  },
];

/* Keep the first layer short enough to sit beside/above the composer without
   becoming a second navigation panel. The desktop pair mirrors ChatGPT's
   add-content/search affordances; every other workflow remains available in
   the expanded layer below it. */
const DESKTOP_PRIMARY_WORKFLOW_ORDER = ['upload', 'research'] as const;
const DESKTOP_PRIMARY_WORKFLOW_KEYS = new Set<string>(DESKTOP_PRIMARY_WORKFLOW_ORDER);
const WORKFLOW_ORDER = ['write', 'research', 'deepResearch', 'explore', 'analyze', 'codex', 'exam', 'skills'] as const;

const TOOLS_DISCLOSURE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/></svg>';

const DISCLOSURE_CHEVRON = <svg className="composer-tools-disclosure" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;

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
  const labelKey = spec.key === 'research' ? 'composer.tools.webSearch' : spec.nameKey;
  const labelFallback = spec.key === 'research' ? 'Web search' : spec.nameFallback;
  const label = i18n(labelKey, labelFallback);
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
      {active ? <span className="composer-tools-active-dot" aria-label="Active" /> : null}
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

function ToolsDisclosure({
  expanded,
  mobile,
  onToggle,
}: {
  expanded: boolean;
  mobile?: boolean;
  onToggle: () => void;
}) {
  const labelKey = mobile
    ? (expanded ? 'composer.tools.mobileLess' : 'composer.tools.mobile')
    : (expanded ? 'composer.tools.less' : 'composer.tools.more');
  const fallback = mobile
    ? (expanded ? 'Hide tools' : 'Tools')
    : (expanded ? 'Show fewer' : 'More tools');

  return (
    <button
      type="button"
      className={`composer-tools-more-toggle${mobile ? ' composer-tools-mobile-item' : ''}`}
      role="menuitem"
      aria-expanded={expanded}
      aria-controls={mobile ? 'composerToolsMobileMore' : 'composerToolsDesktopMore'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: TOOLS_DISCLOSURE_ICON }} />
      <span className="composer-tools-copy"><span>{i18n(labelKey, fallback)}</span></span>
      {expanded ? <svg className="composer-tools-disclosure is-expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg> : DISCLOSURE_CHEVRON}
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

function pluginStatusLabel(plugin: PluginCatalogEntry): string {
  if (plugin.connectionStatus === 'connected') return plugin.displayName ? `Connected · ${plugin.displayName}` : 'Connected';
  if (plugin.connectionStatus === 'initiated') return 'Waiting for authorization';
  if (plugin.connectionStatus === 'needs_installation') return 'Finish installation';
  if (plugin.connectionStatus === 'unavailable') return 'Unavailable';
  return 'Connect to use';
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
  const connected = plugin.connectionStatus === 'connected';
  const unavailable = plugin.connectionStatus === 'unavailable';
  const capabilityText = plugin.capabilities.slice(0, 2).join(' · ');
  return (
    <button
      type="button"
      className={`composer-tools-plugin-item${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}
      data-composer-plugin={plugin.id}
      role="menuitem"
      disabled={unavailable}
      aria-pressed={connected ? selected : undefined}
      aria-label={`${plugin.name}: ${pluginStatusLabel(plugin)}`}
      onClick={(event) => {
        event.stopPropagation();
        onPick(plugin);
      }}
    >
      <PluginMark plugin={plugin} />
      <span className="composer-tools-plugin-copy">
        <span className="composer-tools-plugin-name">{plugin.name}</span>
        <small>{plugin.description || capabilityText || pluginStatusLabel(plugin)}</small>
      </span>
      <span className={`composer-tools-plugin-status${connected ? ' is-connected' : ''}`}>
        {connected ? (selected ? 'Added' : '+') : pluginStatusLabel(plugin)}
      </span>
    </button>
  );
}

function PluginItems({
  isOpen,
  mode,
  onClose,
}: {
  isOpen: boolean;
  mode: 'topic' | 'chat' | null;
  onClose: () => void;
}) {
  const [plugins, setPlugins] = useState<ReadonlyArray<PluginCatalogEntry>>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPlugins = mode ? selectionSnapshot[mode] : [];

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    loadPluginCatalog()
      .then((entries) => {
        if (!cancelled) setPlugins(entries);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const visiblePlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return plugins;
    return plugins.filter((plugin) => [plugin.name, plugin.description, ...plugin.capabilities].join(' ').toLowerCase().includes(normalized));
  }, [plugins, query]);

  const pickPlugin = (plugin: PluginCatalogEntry) => {
    if (!mode) return;
    if (plugin.connectionStatus === 'connected') {
      toggleComposerPlugin(mode, plugin, pluginIconMarkup(plugin.id));
      return;
    }
    const actions = getLegacyActions().workspace;
    if (plugin.connectionStatus === 'initiated' || plugin.connectionStatus === 'needs_installation') {
      actions?.refreshProjectConnector?.(plugin.id);
    } else if (plugin.authType === 'api_key' || plugin.authType === 'custom_credential') {
      actions?.openProjectConnectorForm?.(plugin.id);
    } else {
      actions?.connectProjectConnector?.(plugin.id);
    }
    onClose();
  };

  return (
    <section className="composer-tools-plugins" aria-label="Plugins">
      <div className="composer-tools-section-heading">
        <span>Plugins</span>
        <span>{plugins.filter((plugin) => plugin.connectionStatus === 'connected').length} connected</span>
      </div>
      <label className="composer-tools-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins" aria-label="Search plugins" />
      </label>
      {loading ? <div className="composer-tools-plugin-state">Loading plugins…</div> : null}
      {!loading && error ? <div className="composer-tools-plugin-state">Plugins unavailable. Open Plugin Center to retry.</div> : null}
      {!loading && !error && visiblePlugins.length === 0 ? <div className="composer-tools-plugin-state">No matching plugins.</div> : null}
      {!loading && !error && visiblePlugins.length > 0 ? (
        <div className="composer-tools-plugin-list">
          {visiblePlugins.map((plugin) => (
            <ComposerPluginItem
              key={plugin.id}
              plugin={plugin}
              selected={selectedPlugins.some((selectedPlugin) => selectedPlugin.id === plugin.id)}
              onPick={pickPlugin}
            />
          ))}
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
  const [showMore, setShowMore] = useState(false);
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPluginCount = mode ? selectionSnapshot[mode].length : 0;
  useEffect(() => {
    if (!isOpen) setShowMore(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(() => repositionComposerTools());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, showMore, selectedPluginCount]);

  const closeMenu = () => {
    const snapshot = installComposerToolsBridge().getSnapshot();
    const trigger = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
    if (trigger && snapshot.mode && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(trigger, snapshot.mode);
    }
  };

  const definitions = toolDefinitions();
  const primary = DESKTOP_PRIMARY_WORKFLOW_ORDER
    .map((key) => definitions.find((spec) => spec.key === key))
    .filter((spec): spec is MenuItemSpec => Boolean(spec));
  const secondary = WORKFLOW_ORDER
    .filter((key) => !DESKTOP_PRIMARY_WORKFLOW_KEYS.has(key))
    .map((key) => definitions.find((spec) => spec.key === key))
    .filter((spec): spec is MenuItemSpec => Boolean(spec));
  const secondaryKeys = new Set(secondary.map((spec) => spec.key));
  definitions.forEach((spec) => {
    if (!DESKTOP_PRIMARY_WORKFLOW_KEYS.has(spec.key) && !secondaryKeys.has(spec.key)) {
      secondary.push(spec);
    }
  });
  const mobileSecondary = [
    ...WORKFLOW_ORDER
      .map((key) => definitions.find((spec) => spec.key === key))
      .filter((spec): spec is MenuItemSpec => Boolean(spec)),
    ...definitions.filter((spec) => spec.key !== 'upload' && !WORKFLOW_ORDER.includes(spec.key as typeof WORKFLOW_ORDER[number])),
    MOBILE_THINKING_SPEC,
  ];

  return (
    <>
      <div className="composer-tools-desktop-items">
        {primary.map((spec) => (
          <MenuItem
            key={spec.key}
            spec={spec}
            active={spec.key === activeKey}
            onPick={onPick}
          />
        ))}
        <ToolsDisclosure expanded={showMore} onToggle={() => setShowMore((value) => !value)} />
        <div id="composerToolsDesktopMore" className="composer-tools-more-items" hidden={!showMore}>
          {secondary.map((spec) => (
            <MenuItem
              key={spec.key}
              spec={spec}
              active={spec.key === activeKey}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
      <div className="composer-tools-mobile-items">
        {MOBILE_MENU_ITEMS.map((item) => (
          <MobileMenuItem
            key={item.action}
            {...item}
            active={item.action === activeKey}
            onPick={onPick}
          />
        ))}
        <ToolsDisclosure expanded={showMore} mobile onToggle={() => setShowMore((value) => !value)} />
        <div id="composerToolsMobileMore" className="composer-tools-more-items composer-tools-mobile-more-items" hidden={!showMore}>
          {mobileSecondary.map((spec) => (
            <MenuItem
              key={spec.key}
              spec={spec}
              active={spec.key === activeKey}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
      <PluginItems isOpen={isOpen} mode={mode} onClose={closeMenu} />
    </>
  );
}

function ComposerToolsMenu() {
  const snapshot = useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();
  const extensionState = window as unknown as {
    _activeTemplate?: { extensionKey?: string } | null;
    extensiveThinkingOn?: boolean;
  };
  const activeKey = extensionState._activeTemplate?.extensionKey
    ?? (extensionState.extensiveThinkingOn ? 'extensiveThinking' : null);

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
