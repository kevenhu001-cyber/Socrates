import { useEffect, useReducer } from 'react';

import { ComposerPluginItems } from './ComposerPluginItems';
import { MenuItem, MobileTileItem, MobileToolRow } from './ComposerToolItems';
import {
  i18n,
  menuCopy,
  MOBILE_GROUP_ORDER,
  MOBILE_THINKING_SPEC,
  MOBILE_TILES,
  TOOL_GROUPS,
  toolDefinitions,
  type MenuItemSpec,
} from './composerToolsMenuData';
import { interfaceIcon } from '../../legacy/icons/interfaceIcons';
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
  const findTools = (actions: ReadonlyArray<string>) =>
    actions
      .map((key) => definitions.find((spec) => spec.key === key))
      .filter((spec): spec is MenuItemSpec => Boolean(spec));
  const groups = TOOL_GROUPS.map((group) => ({
    ...group,
    label: i18n(group.labelKey, group.label),
    tools: findTools(group.actions),
  }));

  const excludedMobileKeys = new Set(['upload', 'webSearch', 'skills']);
  const allMobileTools = [
    ...findTools(MOBILE_GROUP_ORDER.flatMap((g) => g.actions)),
    MOBILE_THINKING_SPEC,
  ];
  const remainingMobileTools = allMobileTools.filter((spec) => !excludedMobileKeys.has(spec.key));

  return (
    <>
      <div className="composer-tools-desktop-items">
        {groups.map((group) =>
          group.tools.length ? (
            <div
              className="composer-tools-group"
              role="group"
              aria-label={group.label}
              key={group.key}
            >
              <div className="composer-tools-group-label">{group.label}</div>
              {group.tools.map((spec) => (
                <MenuItem
                  key={spec.key}
                  spec={spec}
                  active={spec.key === activeKey}
                  onPick={onPick}
                />
              ))}
            </div>
          ) : null,
        )}
      </div>
      <div className="composer-tools-mobile-items">
        <div className="composer-tools-group-label">
          {i18n('composer.tools.group.context', 'Add context')}
        </div>
        {/* 4-Tile Grid: 拍照, 照片, 本地文件, 微信文件 */}
        <div className="composer-tools-tiles">
          {MOBILE_TILES.map((tile) => (
            <MobileTileItem
              key={tile.action}
              action={tile.action}
              labelKey={tile.labelKey}
              label={tile.label}
              iconName={tile.iconName}
              onPick={onPick}
            />
          ))}
        </div>
        {/* Mobile Rows List: 插件, 技能, 联网搜索, and workflows */}
        <div className="composer-tools-mobile-list">
          <MobileToolRow
            action="managePlugins"
            iconHtml={interfaceIcon('plug', 22)}
            title={i18n('composer.tools.plugins', '插件')}
            subtitle={i18n('composer.tools.plugins.desc', '接入 App 和数据库，帮你自动操作')}
            onPick={onPick}
          />
          <MobileToolRow
            action="skills"
            iconHtml={interfaceIcon('skillsBadge', 22)}
            title={i18n('extensions.skills.name', '技能')}
            subtitle={i18n('composer.tools.skills.desc', '复用专业能力，稳定处理特定任务')}
            onPick={onPick}
          />
          <MobileToolRow
            action="webSearch"
            iconHtml={interfaceIcon('webSearch', 22)}
            title={i18n('composer.tools.webSearch', '联网搜索')}
            rightText={i18n('composer.tools.webSearch.auto', '自动')}
            active={activeKey === 'webSearch'}
            isToggle={true}
            onPick={onPick}
          />
          {remainingMobileTools.map((spec) => {
            const { label, description } = menuCopy(spec);
            return (
              <MobileToolRow
                key={spec.key}
                action={spec.key as ComposerToolsAction}
                iconHtml={spec.icon}
                title={label}
                subtitle={description}
                active={spec.key === activeKey}
                isToggle={spec.kind === 'toggle'}
                onPick={onPick}
              />
            );
          })}
        </div>
      </div>
      <ComposerPluginItems isOpen={isOpen} mode={mode} onPick={onPick} />
    </>
  );
}
