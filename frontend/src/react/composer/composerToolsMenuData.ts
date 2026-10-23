import { interfaceIcon } from '../../ui/icons/interfaceIcons';
import {
  t as _t,
} from '../legacy/gateway.ts';
import { registry } from '../../extensions/registry';
import { extensiveThinkingExtension } from '../../extensions/modules/extensiveThinking';
import type { ExtensionDefinition } from '../../extensions/types';

export type MenuItemSpec = ExtensionDefinition;

export const MOBILE_MENU_ITEMS: ReadonlyArray<{
  action: 'camera' | 'photos';
  labelKey: string;
  label: string;
  icon: string;
}> = [
  {
    action: 'camera',
    labelKey: 'composer.tools.camera',
    label: 'Camera',
    icon: interfaceIcon('camera', 18),
  },
  {
    action: 'photos',
    labelKey: 'composer.tools.photos',
    label: 'Photos',
    icon: interfaceIcon('image', 18),
  },
];

export const TOOL_GROUPS: ReadonlyArray<{
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
    actions: ['webSearch', 'explore', 'deepResearch'],
  },
  {
    key: 'create',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['write', 'analyze', 'createImage', 'createSite', 'exam', 'skills'],
  },
];

/* The phone sheet keeps camera, photos, files, image creation, and search
   ahead of longer workflows. The desktop twin retains all group labels. */
export const MOBILE_GROUP_ORDER: ReadonlyArray<{
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
    key: 'create',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['createImage'],
  },
  {
    key: 'research',
    labelKey: 'composer.tools.group.research',
    label: 'Search & research',
    actions: ['webSearch', 'explore', 'deepResearch'],
  },
  {
    key: 'workflows',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['write', 'analyze', 'createSite', 'exam', 'skills'],
  },
];

export const MOBILE_THINKING_SPEC: MenuItemSpec = {
  ...extensiveThinkingExtension,
  nameKey: 'composer.tools.thinkDeeper',
  nameFallback: 'Think deeper',
};

export function toolDefinitions(): MenuItemSpec[] {
  return registry.byPlacement('tools');
}

export function i18n(key: string, fallback: string): string {
  const value = _t(key);
  return value !== key ? value : fallback;
}

export function menuCopy(spec: MenuItemSpec): { label: string; description: string } {
  const label = i18n(spec.nameKey, spec.nameFallback);
  const description = spec.descriptionKey
    ? i18n(spec.descriptionKey, spec.descriptionFallback ?? '')
    : '';
  return { label, description };
}
