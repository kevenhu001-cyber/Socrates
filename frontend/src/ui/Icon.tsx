/**
 * Icon — render a registered SVG icon as a React element.
 *
 * Props
 *  - name     : registered icon name (see iconRegistry.ts).
 *  - size     : width / height in pixels. Defaults to 16, matching
 *                the most common button-icon footprint in the app.
 *  - strokeWidth : override the shared 1.75px stroke.
 *  - className : extra utility classes (margin, alignment, color
 *                  helpers from the design-token CSS).
 *  - ...rest   : arbitrary svg attributes (`role`, `aria-*`,
 *                  `data-*`, `style`). Passed through verbatim.
 *
 * Behavior
 *  - The `spinner` name renders an empty `<span>` so the consumer
 *    can apply the existing `thinking-ring` class without losing
 *    layout. Other names render a real `<svg>`.
 *  - Unknown names render an empty SVG so layout
 *    stays stable; no unknown string ever becomes HTML, so the
 *    `dangerouslySetInnerHTML` removal in M4 has no security
 *    regression.
 */

import React from 'react';
import { INTERFACE_ICON_STROKE } from './icons/interfaceIcons';

import { type IconName } from './iconRegistry';
import { getIconDescriptor } from './iconRegistry';

export interface IconProps
  extends Omit<React.SVGAttributes<SVGSVGElement>, 'name' | 'children'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export const Icon = React.forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 16, strokeWidth = INTERFACE_ICON_STROKE, className, ...rest },
  ref,
) {
  const descriptor = getIconDescriptor(name);

  /* Spinner is non-SVG by design — return a span sized to `size`
     so callers can stack it next to text without inline styles. */
  if (name === 'spinner') {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ display: 'inline-block', width: size, height: size }}
      />
    );
  }

  return (
    <svg
      ref={ref}
      viewBox={descriptor.viewBox ?? '0 0 24 24'}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {descriptor.children}
    </svg>
  );
});

export default Icon;