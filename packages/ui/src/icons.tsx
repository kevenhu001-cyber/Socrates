/**
 * Shell icons — the React Native port of the baseline SPA's inline SVGs.
 *
 * Every shape below is copied verbatim from the frontend sources so the
 * Universal App draws the same glyph geometry as the SPA:
 *   - `frontend/src/react/sidebar/SidebarNav.tsx` (nav rows)
 *   - `frontend/src/react/sidebar-chrome/SidebarHeader.tsx` (new chat / toggle / search)
 *   - `frontend/src/react/message-list/MessageToolbar.tsx` (message toolbar)
 *   - `frontend/src/react/lib/boot/indicatorComponents.tsx` (send / stop)
 *   - `frontend/index.html` (topbar, footer, composer controls)
 * Stroke widths are the *effective* ones: `styles/parity/sidebar.css`
 * forces 1.75px on nav glyphs and `styles/legacy/06-chat-transcript.css`
 * forces 1.7px on toolbar glyphs, so those are used here.
 *
 * Shape tuples: p=path, c=circle(cx,cy,r), r=rect(x,y,w,h,rx),
 * l=line(x1,y1,x2,y2), pl=polyline(points).
 */
import React, { createContext, useContext } from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

type Shape =
  | ['p', string]
  | ['c', number, number, number]
  | ['r', number, number, number, number, number]
  | ['l', number, number, number, number]
  | ['pl', string];

interface Glyph {
  /** viewBox size (square). */
  vb: number;
  /** Effective stroke width (CSS-forced value, not the dead attribute). */
  sw: number;
  /** stroke-linecap: round (baseline: round everywhere except the panel glyph). */
  cap: boolean;
  /** stroke-linejoin: round (omitted on the summary / plus / close glyphs). */
  join: boolean;
  shapes: Shape[];
}

const box = (vb: number, sw: number, shapes: Shape[], cap = true, join = true): Glyph => ({ vb, sw, shapes, cap, join });

export const GLYPHS = {
  /* ── Sidebar header ─────────────────────────────────────────────────── */
  'new-chat': box(24, 1.75, [
    ['p', 'M12 20h9'],
    ['p', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  ]),
  /** Desktop panel glyph (viewBox 20, no linecap). */
  panel: box(20, 1.6, [
    ['r', 2.75, 3.75, 14.5, 12.5, 2.5],
    ['p', 'M7.25 3.75v12.5'],
  ], false, true),
  /** Mobile drawer close ×. */
  close: box(24, 2, [['p', 'm6 6 12 12M18 6 6 18']], true, false),
  hamburger: box(24, 2, [
    ['l', 5, 7, 19, 7],
    ['l', 5, 12, 19, 12],
    ['l', 5, 17, 19, 17],
  ]),
  /** Phone SPA sidebar toggle (frontend/index.html #sidebarOpenBtn). */
  'sidebar-toggle': box(24, 2.2, [
    ['p', 'M6 9h12'],
    ['p', 'M6 15h8'],
  ]),
  search: box(24, 2, [['c', 11, 11, 7], ['p', 'm21 21-4.3-4.3']]),
  /** Phone drawer header search (SidebarHeader.tsx SEARCH_ICON: shorter tail). */
  'search-header': box(24, 2, [['c', 11, 11, 7], ['p', 'm20 20-4-4']]),
  knowledge: box(24, 2, [
    ['c', 5.5, 6, 2.1], ['c', 18, 7.5, 2.1], ['c', 12, 18, 2.1],
    ['p', 'M7.5 6.5h8.4M6.7 7.9l4.6 8.2M16.7 9.4l-3.9 6.9'],
  ]),
  bookmark: box(24, 2, [['p', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z']]),

  /* ── Sidebar nav (SidebarNav.tsx order: new · library · projects · scheduled · plugins · sites · more) ── */
  library: box(24, 1.75, [
    ['p', 'm16 6 4 14'],
    ['p', 'M12 6v14'],
    ['p', 'M8 8v12'],
    ['p', 'M4 4v16'],
  ]),
  projects: box(24, 1.75, [
    ['p', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  ]),
  scheduled: box(24, 1.75, [['c', 12, 12, 8.5], ['p', 'M12 7.5V12l3 2']]),
  plugins: box(24, 1.75, [
    ['p', 'M4 7h3a1 1 0 0 0 1-1V5a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-1a2 2 0 0 0-4 0v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H4a2 2 0 0 1 0-4h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1z'],
  ]),
  sites: box(24, 1.75, [
    ['r', 3, 3, 7, 7, 1.5],
    ['r', 14, 3, 7, 7, 1.5],
    ['r', 3, 14, 7, 7, 1.5],
    ['r', 14, 14, 7, 7, 1.5],
  ]),
  more: box(24, 1.75, [
    ['c', 5, 12, 1.4],
    ['c', 12, 12, 1.4],
    ['c', 19, 12, 1.4],
  ]),
  /** Recent-session overflow action; the SPA uses slightly larger dots here. */
  'session-more': box(24, 1.75, [
    ['c', 5, 12, 1.5],
    ['c', 12, 12, 1.5],
    ['c', 19, 12, 1.5],
  ]),

  /* ── Sidebar footer ─────────────────────────────────────────────────── */
  sun: box(24, 2, [
    ['c', 12, 12, 5],
    ['p', 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'],
  ]),
  moon: box(24, 2, [['p', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']]),
  gear: box(24, 2, [
    ['c', 12, 12, 3],
    ['p', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  ]),
  sliders: box(24, 2, [
    ['l', 21, 6, 14, 6],
    ['l', 10, 6, 3, 6],
    ['l', 21, 12, 12, 12],
    ['l', 8, 12, 3, 12],
    ['l', 21, 18, 16, 18],
    ['l', 12, 18, 3, 18],
  ]),

  /* ── Topbar ─────────────────────────────────────────────────────────── */
  /** Assistant switcher (lucide `circle-user-round`, strokeWidth 2). */
  user: box(24, 2, [
    ['p', 'M17.925 20.056a6 6 0 0 0-11.851.001'],
    ['c', 12, 11, 4],
    ['c', 12, 12, 10],
  ]),
  /** Phone top-bar new-chat circle (index.html `#mobileNewChatBtn`). */
  compose: box(24, 1.8, [
    ['p', 'M9 3.5a9 9 0 0 1 9.2 2.3M20.6 9a9 9 0 0 1-2.5 9.2M15 20.5a9 9 0 0 1-6-.6L4 21l1.1-5a9 9 0 0 1-.6-7M6.3 5.5 9 3.5'],
  ]),
  share: box(24, 2, [
    ['p', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'],
    ['pl', '16 6 12 2 8 6'],
    ['l', 12, 2, 12, 15],
  ]),
  summary: box(24, 1.8, [
    ['c', 4, 6, 1],
    ['p', 'M9 6h11M4 12h1m4 0h11M4 18h1m4 0h11'],
  ], true, false),
  caret: box(24, 2, [['p', 'M6 9l6 6 6-6']]),
  'model-caret': box(16, 1.6, [['p', 'm4.5 6.5 3.5 3.5 3.5-3.5']]),

  /* ── Composer ───────────────────────────────────────────────────────── */
  plus: box(24, 2, [['p', 'M12 5v14M5 12h14']], true, false),
  mic: box(24, 2, [
    ['r', 9, 3, 6, 11, 3],
    ['p', 'M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8'],
  ]),
  send: box(24, 2.5, [['p', 'M12 19V5M5 12l7-7 7 7']]),
  stop: box(24, 2, [['r', 6, 6, 12, 12, 2]]),
  /** Idle composer glyph (lucide `audio-lines`, strokeWidth 2.2). */
  voice: box(24, 2.2, [
    ['p', 'M2 10v3'],
    ['p', 'M6 6v11'],
    ['p', 'M10 3v18'],
    ['p', 'M14 8v7'],
    ['p', 'M18 5v13'],
    ['p', 'M22 10v3'],
  ]),

  /* ── Message toolbar (MessageToolbar.tsx) ───────────────────────────── */
  copy: box(24, 1.7, [
    ['r', 8, 8, 14, 14, 2.5],
    ['p', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  ]),
  check: box(24, 1.7, [['pl', '20 6 9 17 4 12']]),
  edit: box(24, 1.7, [
    ['p', 'M12 20h9'],
    ['p', 'M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z'],
  ]),
  delete: box(24, 1.7, [
    ['p', 'M3 6h18'],
    ['p', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'],
    ['p', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    ['l', 10, 11, 10, 17],
    ['l', 14, 11, 14, 17],
  ]),
  regenerate: box(24, 1.7, [
    ['p', 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'],
    ['p', 'M21 3v5h-5'],
    ['p', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'],
    ['p', 'M8 16H3v5'],
  ]),
  'thumb-up': box(24, 1.7, [
    ['p', 'M7 10v12'],
    ['p', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'],
  ]),
  'thumb-down': box(24, 1.7, [
    ['p', 'M17 14V2'],
    ['p', 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z'],
  ]),
  branch: box(24, 1.7, [
    ['l', 6, 3, 6, 15],
    ['c', 18, 6, 3],
    ['c', 6, 18, 3],
    ['p', 'M18 9a9 9 0 0 1-9 9'],
  ]),
  bulb: box(24, 1.7, [
    ['p', 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'],
    ['p', 'M9 18h6'],
    ['p', 'M10 22h4'],
  ]),
  speaker: box(24, 1.7, [
    ['p', 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z'],
    ['p', 'M16 9a5 5 0 0 1 0 6'],
    ['p', 'M19.364 18.364a9 9 0 0 0 0-12.728'],
  ]),
} as const;

export type IconName = keyof typeof GLYPHS;

export interface IconProps {
  name: IconName;
  /** Rendered box in px; also the CSS-forced size in the baseline (18/20/16). */
  size?: number;
  /** Optional non-square SVG box for baseline icons with a squashed viewBox. */
  width?: number;
  height?: number;
  /** Baseline icons use `currentColor`; RN needs the resolved color. */
  color: string;
  /** Optional per-surface stroke override (the message toolbar uses 1.7). */
  strokeWidth?: number;
}

export type IconRenderer = React.ComponentType<IconProps>;

const IconRendererContext = createContext<IconRenderer | null>(null);

export function IconRendererProvider({ renderer, children }: { renderer: IconRenderer | null; children: React.ReactNode }) {
  return <IconRendererContext.Provider value={renderer}>{children}</IconRendererContext.Provider>;
}

/** One baseline glyph, verbatim geometry. */
export function Icon({ name, size = 20, width, height, color, strokeWidth }: IconProps) {
  const Renderer = useContext(IconRendererContext);
  if (Renderer) return <Renderer name={name} size={size} width={width} height={height} color={color} strokeWidth={strokeWidth} />;
  const g = GLYPHS[name];
  return (
    <Svg
      width={width ?? size}
      height={height ?? size}
      viewBox={`0 0 ${g.vb} ${g.vb}`}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth ?? g.sw}
      strokeLinecap={g.cap ? 'round' : 'butt'}
      strokeLinejoin={g.join ? 'round' : 'miter'}
    >
      {g.shapes.map((shape, index) => {
        const key = `${name}-${index}`;
        if (shape[0] === 'p') return <Path key={key} d={shape[1]} />;
        if (shape[0] === 'c') return <Circle key={key} cx={shape[1]} cy={shape[2]} r={shape[3]} />;
        if (shape[0] === 'r') return <Rect key={key} x={shape[1]} y={shape[2]} width={shape[3]} height={shape[4]} rx={shape[5]} />;
        if (shape[0] === 'l') return <Line key={key} x1={shape[1]} y1={shape[2]} x2={shape[3]} y2={shape[4]} />;
        return <Polyline key={key} points={shape[1]} />;
      })}
    </Svg>
  );
}

export default Icon;
