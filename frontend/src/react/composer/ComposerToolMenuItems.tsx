import { useEffect, useState } from 'react';

import { repositionComposerTools } from '../../ui/composerTools';
import { useComposerPluginSelectionSnapshot } from './pluginSelection';
import { ComposerPluginItems } from './ComposerPluginItems';
import { MenuItem, MobileMenuItem } from './ComposerToolItems';
import {
  i18n,
  menuCopy,
  MOBILE_GROUP_ORDER,
  MOBILE_MENU_ITEMS,
  MOBILE_THINKING_SPEC,
  TOOL_GROUPS,
  toolDefinitions,
  type MenuItemSpec,
} from './composerToolsMenuData';
import type { ComposerToolsAction } from './types';

export function ComposerToolMenuItems({
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
  const findTools = (actions: ReadonlyArray<string>) => actions
    .map((key) => definitions.find((spec) => spec.key === key))
    .filter((spec): spec is MenuItemSpec => Boolean(spec))
    .filter(matchesQuery);
  const footerPlaceholder = i18n('composer.tools.searchFooter', 'Search tools and connected apps');
  const mobileStaticItems = MOBILE_MENU_ITEMS.filter((item) => {
    if (!normalizedQuery) return true;
    return [i18n(item.labelKey, item.label), item.action].join(' ').toLowerCase().includes(normalizedQuery);
  });
  const groups = TOOL_GROUPS.map((group) => ({
    ...group,
    label: i18n(group.labelKey, group.label),
    tools: findTools(group.actions),
  }));
  const mobileGroupTools = MOBILE_GROUP_ORDER.map((group) => ({
    ...group,
    label: i18n(group.labelKey, group.label),
    tools: [
      ...findTools(group.actions),
      ...(group.key === 'workflows' && matchesQuery(MOBILE_THINKING_SPEC) ? [MOBILE_THINKING_SPEC] : []),
    ],
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
          if (!staticItems.length && !group.tools.length) return null;
          return (
            <div className="composer-tools-group" role="group" aria-label={group.label} key={group.key}>
              <div className="composer-tools-group-label">{group.label}</div>
              {staticItems.map((item) => (
                <MobileMenuItem key={item.action} {...item} active={item.action === activeKey} onPick={onPick} />
              ))}
              {group.tools.map((spec) => (
                <MenuItem key={spec.key} spec={spec} active={spec.key === activeKey} onPick={onPick} />
              ))}
            </div>
          );
        })}
        {normalizedQuery && !hasMobileToolMatch ? (
          <div className="composer-tools-plugin-state" role="status">{i18n('composer.tools.noMatch', 'No matching actions.')}</div>
        ) : null}
      </div>
      <ComposerPluginItems isOpen={isOpen} mode={mode} query={query} onPick={onPick} />
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
