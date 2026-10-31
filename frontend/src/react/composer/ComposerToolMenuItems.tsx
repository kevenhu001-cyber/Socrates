import { useEffect, useReducer } from 'react';

import { ComposerPluginItems } from './ComposerPluginItems';
import { MenuItem, MobileMenuItem } from './ComposerToolItems';
import {
  i18n,
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
  const [, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  const definitions = toolDefinitions();
  const findTools = (actions: ReadonlyArray<string>) => actions
    .map((key) => definitions.find((spec) => spec.key === key))
    .filter((spec): spec is MenuItemSpec => Boolean(spec));
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
      ...(group.key === 'workflows' ? [MOBILE_THINKING_SPEC] : []),
    ],
  }));

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
      </div>
      <div className="composer-tools-mobile-items">
        {mobileGroupTools.map((group) => {
          const staticItems = group.key === 'context'
            ? MOBILE_MENU_ITEMS.filter((item) => item.action === 'camera' || item.action === 'photos')
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
      </div>
      <ComposerPluginItems isOpen={isOpen} mode={mode} onPick={onPick} />
    </>
  );
}
