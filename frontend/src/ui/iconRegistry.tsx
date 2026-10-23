/** React and legacy renderers share the same static interface glyphs. */
import React, { type ReactNode } from 'react';
import { getInterfaceIconShapes, interfaceIcon, type InterfaceIconName } from './icons/interfaceIcons';

const ALIASES = {
  'new-chat': 'newChat',
  'sidebar-close': 'panel',
  delete: 'close',
  remove: 'close',
} as const satisfies Record<string, InterfaceIconName>;

export type IconName = InterfaceIconName | keyof typeof ALIASES | 'spinner';

interface IconDescriptor {
  readonly viewBox?: string;
  readonly children: ReactNode;
}

function resolve(name: Exclude<IconName, 'spinner'>): InterfaceIconName {
  return Object.prototype.hasOwnProperty.call(ALIASES, name)
    ? ALIASES[name as keyof typeof ALIASES] : name as InterfaceIconName;
}

// Build static React nodes once, without parsing or injecting SVG strings.
const descriptors = new Map<IconName, IconDescriptor>();
export function getIconDescriptor(name: IconName): IconDescriptor {
  if (name === 'spinner') return { children: null };
  let descriptor = descriptors.get(name);
  if (!descriptor) {
    const shapes = getInterfaceIconShapes(resolve(name));
    if (!shapes.length) return { children: null };
    descriptor = { children: shapes.map(([tag, attrs], key) => React.createElement(tag, { ...attrs, key })) };
    descriptors.set(name, descriptor);
  }
  return descriptor;
}

export function getIconHtml(name: IconName): string {
  if (name === 'spinner') return '<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>';
  return interfaceIcon(resolve(name));
}