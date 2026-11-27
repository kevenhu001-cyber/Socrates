import { useEffect, useReducer } from 'react';

import { ComposerPluginItems } from './ComposerPluginItems';
import { MenuItem, MobileToolRow } from './ComposerToolItems';
import {
  i18n,
  menuCopy,
  MOBILE_GROUP_ORDER,
  MOBILE_THINKING_SPEC,
  MOBILE_MEDIA_ACTIONS,
  TOOL_GROUPS,
  toolDefinitions,
  type MenuItemSpec,
} from './composerToolsMenuData';
import { useStoredReasoningEffort } from '../chat-configuration/useChatConfigurationLabels';
import { effortLabel } from '../chat-configuration/ChatConfigurationPanels';
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
  const effort = useStoredReasoningEffort();
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
        <div className="composer-tools-mobile-list">
          {MOBILE_MEDIA_ACTIONS.map((item) => (
            <MobileToolRow
              key={item.action}
              action={item.action}
              iconName={item.iconName}
              title={i18n(item.labelKey, item.label)}
              onPick={onPick}
            />
          ))}
          <MobileToolRow
            action="reasoningEffort"
            iconName="analyze"
            title={i18n('chatconfig.effort', 'Reasoning effort')}
            rightText={effortLabel(effort)}
            onPick={onPick}
          />
          <MobileToolRow
            action="managePlugins"
            iconName="plug"
            title={i18n('composer.tools.plugins', '插件')}
            subtitle={i18n('composer.tools.plugins.desc', '接入 App 和数据库，帮你自动操作')}
            onPick={onPick}
          />
          <MobileToolRow
            action="skills"
            iconName="skillsBadge"
            title={i18n('extensions.skills.name', '技能')}
            subtitle={i18n('composer.tools.skills.desc', '复用专业能力，稳定处理特定任务')}
            onPick={onPick}
          />
          <MobileToolRow
            action="webSearch"
            iconName="webSearch"
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
