/**
 * iconRegistry — single source of truth for inline SVG icons used by
 * React components.
 *
 * Why a registry?
 *  - Components used to carry `const FOO_ICON = '<svg ...>'` literals
 *    plus a `dangerouslySetInnerHTML={{ __html: FOO_ICON }}` render
 *    path. That pattern made every chip, button, and modal host a
 *    separate copy of the SVG, and the `dangerouslySetInnerHTML` path
 *    is a known XSS surface (M4 removes it entirely).
 *  - This module collects those literals under semantic names and
 *    re-exports them as plain JSX-friendly `ReactNode` returns. The
 *    `<Icon />` component (`src/ui/Icon.tsx`) is the only consumer in
 *    React code; legacy JS code keeps reading the raw strings via
 *    `getIconHtml()` for now (M4 retires that path).
 *
 * Adding an icon:
 *  - Append a new entry to `ICONS` below with the desired JSX. The
 *    `name` becomes the public `Icon` prop. Keep paths semantic
 *    ("close", "tag", "remove") rather than visual ("x-circle") so
 *    future redesigns don't have to rename every call site.
 *  - For SVGs that need to compose with state (search, send, voice),
 *    pass the `name` plus the `size` / `strokeWidth` props. The Icon
 *    component forwards `aria-hidden` and other svg attributes via
 *    `restProps`.
 *
 * Anti-XSS posture:
 *  - The registry entries are *static* JSX, not user-supplied
 *    strings. There is no way for runtime data to inject new
 *    content; even if a future caller passes a malicious `name`, the
 *    lookup falls back to a transparent placeholder icon rather than
 *    rendering the unknown string as HTML.
 */

import React, { type ReactNode } from 'react';

export type IconName =
  | 'tag'
  | 'delete'
  | 'pin'
  | 'remove'
  | 'search'
  | 'spinner'
  | 'close'
  | 'new-chat'
  | 'sidebar-close';

interface IconDescriptor {
  /** Default 24×24 viewBox. */
  readonly viewBox?: string;
  /** Path / shape children. Rendered inside a single <svg> root. */
  readonly children: ReactNode;
}

const ICONS: Readonly<Record<IconName, IconDescriptor>> = {
  tag: {
    children: (
      <>
        <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </>
    ),
  },
  delete: {
    children: <path d="M18 6 6 18M6 6l12 12" />,
  },
  pin: {
    children: <path d="M12 2v10l4 4v2H8v-2l4-4V2" />,
  },
  remove: {
    children: <path d="M18 6L6 18M6 6l12 12" />,
  },
  search: {
    children: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
  spinner: {
    /* The `spinner` icon is special — it renders a CSS-driven ring,
       not an SVG path. Returning null here means <Icon name="spinner" />
       produces an empty <span>, which AttachmentChipsRow pairs with
       the existing `thinking-ring` class for the animation. The
       icon-name lookup still succeeds so `getIconHtml()` callers
       can reuse the same vocabulary. */
    children: null,
  },
  close: {
    children: <path d="M18 6 6 18M6 6l12 12" />,
  },
  'new-chat': {
    children: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
      </>
    ),
  },
  'sidebar-close': {
    children: (
      <>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </>
    ),
  },
};

export function getIconDescriptor(name: IconName): IconDescriptor {
  return ICONS[name] ?? { children: null };
}

/**
 * Returns the raw SVG markup string for a registered icon name. This
 * is a transitional escape hatch for legacy JS renderers (e.g. the
 * attachment chip spinner HTML string) that haven't migrated to the
 * React `<Icon />` component yet. M4 retires this and the consuming
 * call sites.
 */
export function getIconHtml(name: IconName): string {
  const descriptor = ICONS[name];
  if (!descriptor) return '';
  /* The spinner case is non-SVG; return the static markup the chip
     path expects. */
  if (name === 'spinner') {
    return '<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>';
  }
  /* For SVG icons we approximate the same markup as the React tree
     produces. We intentionally keep this implementation minimal —
     the goal is to retire it. */
  const viewBox = descriptor.viewBox ?? '0 0 24 24';
  const inner = iconInnerHtml(name);
  return (
    `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
  );
}

function iconInnerHtml(name: IconName): string {
  switch (name) {
    case 'tag':
      return '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>';
    case 'delete':
    case 'remove':
    case 'close':
      return '<path d="M18 6 6 18M6 6l12 12"/>';
    case 'pin':
      return '<path d="M12 2v10l4 4v2H8v-2l4-4V2"/>';
    case 'search':
      return '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>';
    case 'new-chat':
      return '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>';
    case 'sidebar-close':
      return '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>';
    case 'spinner':
      return '';
    default:
      return '';
  }
}