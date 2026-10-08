import React from 'react';

interface ModelCaretProps {
  size: number;
  color: string;
}

/**
 * Match the SPA's inline SVG directly on Web. Native uses react-native-svg;
 * its Web raster differs by a few pixels even with the same path and metrics.
 */
export function ModelCaret({ size, color }: ModelCaretProps) {
  return (
    <svg
      className="top-model-switcher-caret"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: `0 0 ${size}px`, width: size, height: size, color }}
    >
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}
