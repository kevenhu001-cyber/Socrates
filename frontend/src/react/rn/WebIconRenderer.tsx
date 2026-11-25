/**
 * Web renderer for `UiIcon` glyph data (packages/ui/src/primitives/UiIcon.tsx).
 * The shared package only holds geometry; here it becomes an inline svg with
 * a non-scaling stroke, so every glyph draws the same 1.5px line regardless
 * of its rendered size.
 */
import type { UiIconRendererProps } from '@socrates/ui/primitives';
import { Icon, type IconProps } from '../../legacy/Icon';

const OFFICIAL_WEB_GLYPHS: Partial<Record<UiIconRendererProps['name'], IconProps['name']>> = {
  plus: 'plus',
  paperclip: 'paperclip',
  image: 'image',
  globe: 'webSearch',
  compose: 'newChat',
  'new-chat': 'newChat',
  search: 'search',
  folder: 'folder',
  library: 'library',
  clock: 'clock',
  panel: 'panel',
  sliders: 'sliders',
  sparkle: 'personalization',
  skills: 'skills',
};

export function WebIconRenderer({ name, shapes, size, color, strokeWidth }: UiIconRendererProps) {
  const official = OFFICIAL_WEB_GLYPHS[name];
  if (official) {
    return (
      <Icon
        name={official}
        size={size}
        data-ui-icon={name}
        style={{ color, display: 'block', flexShrink: 0 }}
      />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-ui-icon={name}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {shapes.map((shape, index) => {
        const key = `${name}-${index}`;
        const common = { vectorEffect: 'non-scaling-stroke' as const };
        if (shape[0] === 'p') return <path key={key} d={shape[1]} {...common} />;
        if (shape[0] === 'c')
          return <circle key={key} cx={shape[1]} cy={shape[2]} r={shape[3]} {...common} />;
        if (shape[0] === 'r')
          return (
            <rect
              key={key}
              x={shape[1]}
              y={shape[2]}
              width={shape[3]}
              height={shape[4]}
              rx={shape[5]}
              {...common}
            />
          );
        return (
          <line key={key} x1={shape[1]} y1={shape[2]} x2={shape[3]} y2={shape[4]} {...common} />
        );
      })}
    </svg>
  );
}
