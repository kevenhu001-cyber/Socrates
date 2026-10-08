import React from 'react';
import { GLYPHS, type IconProps } from '@socrates/ui';

/** Render the same inline SVG elements as the SPA on Web. */
export function webIconRenderer({ name, size = 20, width, height, color, strokeWidth }: IconProps) {
  const glyph = GLYPHS[name];
  const toolbarIcon = strokeWidth === 1.7 && (name === 'share' || name === 'speaker');
  const iconWidth = width ?? size;
  const iconHeight = height ?? size;
  const shapes = glyph.shapes.map((shape, index) => {
    const key = `${name}-${index}`;
    switch (shape[0]) {
      case 'p': return <path key={key} d={shape[1]} />;
      case 'c': return <circle key={key} cx={shape[1]} cy={shape[2]} r={shape[3]} />;
      case 'r': return <rect key={key} x={shape[1]} y={shape[2]} width={shape[3]} height={shape[4]} rx={shape[5]} />;
      case 'l': return <line key={key} x1={shape[1]} y1={shape[2]} x2={shape[3]} y2={shape[4]} />;
      case 'pl': return <polyline key={key} points={shape[1]} />;
    }
  });
  return (
    <svg
      data-socrates-icon-renderer="web"
      width={toolbarIcon ? undefined : iconWidth}
      height={toolbarIcon ? undefined : iconHeight}
      viewBox={`0 0 ${glyph.vb} ${glyph.vb}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={toolbarIcon ? 1.8 : strokeWidth ?? glyph.sw}
      strokeLinecap={glyph.cap ? 'round' : 'butt'}
      strokeLinejoin={glyph.join ? 'round' : 'miter'}
      style={toolbarIcon
        ? { width: `${iconWidth}px`, height: `${iconHeight}px`, display: 'block', strokeWidth: '1.7px' }
        : { color }}
      aria-hidden="true"
    >
      {shapes}
    </svg>
  );
}
