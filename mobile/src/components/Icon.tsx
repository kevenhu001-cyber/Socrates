import React from 'react';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

export type NativeIconName =
  | 'search'
  | 'plus'
  | 'more'
  | 'close'
  | 'chevron-down'
  | 'chevron-forward'
  | 'refresh'
  | 'trash'
  | 'pencil'
  | 'folder'
  | 'library'
  | 'calendar'
  | 'puzzle'
  | 'filter'
  | 'send'
  | 'sun'
  | 'inbox'
  | 'robot'
  | 'laptop'
  | 'file'
  | 'image'
  | 'video'
  | 'audio'
  | 'grid'
  | 'book';

type Props = {
  name: NativeIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/**
 * The web directory pages use a small monochrome 24px stroke vocabulary.
 * Keep that vocabulary in RN instead of relying on platform font glyphs from
 * Ionicons, whose geometry changes between Android and web builds.
 */
export function Icon({ name, size = 18, color = '#000000', strokeWidth = 1.8 }: Props) {
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'search':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Circle cx="11" cy="11" r="7" /><Path d="m20 20-4-4" /></Svg>;
    case 'plus':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M12 5v14M5 12h14" /></Svg>;
    case 'more':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Circle cx="5" cy="12" r="1.5" /><Circle cx="12" cy="12" r="1.5" /><Circle cx="19" cy="12" r="1.5" /></Svg>;
    case 'close':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M6 6l12 12M18 6 6 18" /></Svg>;
    case 'chevron-down':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="m6 9 6 6 6-6" /></Svg>;
    case 'chevron-forward':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="m9 6 6 6-6 6" /></Svg>;
    case 'refresh':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M20 11a8 8 0 1 0 1 4" /><Path d="M20 4v7h-7" /></Svg>;
    case 'trash':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></Svg>;
    case 'pencil':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M12 20h9" /><Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
    case 'folder':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M3.5 7.5h6l2-2h9v13h-17z" /></Svg>;
    case 'library':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Rect x="4" y="3" width="16" height="18" rx="2" /><Path d="M8 3v18" /></Svg>;
    case 'calendar':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Rect x="3" y="4" width="18" height="18" rx="3" /><Path d="M8 2v4m8-4v4M3 10h18" /></Svg>;
    case 'puzzle':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M9 3h3a2 2 0 1 1 4 0v2h3v4h2a2 2 0 1 1 0 4h-2v4h-4v2a2 2 0 1 1-4 0v-2H7v-4H5a2 2 0 1 1 0-4h2V7h2z" /></Svg>;
    case 'filter':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M4 5h16l-6.5 8v5l-3 1v-6z" /></Svg>;
    case 'send':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="m5 12 14-7-4 14-3-6z" /><Path d="m12 13 7-8" /></Svg>;
    case 'sun':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Circle cx="12" cy="12" r="4" /><Path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" /></Svg>;
    case 'inbox':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M22 12h-6l-2 3h-4l-2-3H2" /><Path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></Svg>;
    case 'robot':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M12 2.5V5" /><Rect x="5" y="7" width="14" height="11" rx="3.5" /><Path d="M9.5 11.5v2M14.5 11.5v2M10 15.5h4M2.8 10.5v3M21.2 10.5v3" /></Svg>;
    case 'laptop':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Rect x="4" y="4" width="16" height="11" rx="2" /><Path d="M7.5 8h5M7.5 11h8M2.5 19h19" /></Svg>;
    case 'file':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8zM14 2.5V8h5.5" /></Svg>;
    case 'image':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Rect x="3" y="3" width="18" height="18" rx="2.5" /><Circle cx="8.6" cy="8.6" r="1.6" /><Path d="m21 15.5-4.5-4.5L5 22" /></Svg>;
    case 'video':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><Polygon points="10,9 15,12 10,15" /></Svg>;
    case 'audio':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M9 18V5l12-2v13" /><Circle cx="6" cy="18" r="3" /><Circle cx="18" cy="16" r="3" /></Svg>;
    case 'grid':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Rect x="3" y="3" width="18" height="18" rx="2.5" /><Path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></Svg>;
    case 'book':
      return <Svg width={size} height={size} viewBox="0 0 24 24" {...common}><Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Svg>;
  }
}
