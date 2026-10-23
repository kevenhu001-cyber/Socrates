/** Shared interface glyphs for React and the remaining string renderers.
 * 24px grid, 1.75px round strokes, generous counters and quiet rounded shells.
 * Keep brand marks and user-created SVG content outside this collection.
 */
export const INTERFACE_ICON_STROKE = 1.75;

type ShapeTag = 'path' | 'rect' | 'circle';
export type IconShape = readonly [ShapeTag, Readonly<Record<string, string | number>>];
const path = (d: string, attrs: Record<string, string | number> = {}): IconShape => ['path', { d, ...attrs }];
const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => ['rect', { x, y, width, height, rx }];
const circle = (cx: number, cy: number, r: number): IconShape => ['circle', { cx, cy, r }];
const dot = (cx: number, cy: number, r = 1): IconShape => ['circle', { cx, cy, r, fill: 'currentColor', stroke: 'none' }];

const PENCIL = [path('m14.5 5.5 4 4M5 19l3.6-.9L19.2 7.5a2.8 2.8 0 0 0-4-4L4.6 14.1 3.7 18a.8.8 0 0 0 1 1Z')];
const DOCUMENT = [
  path('M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5L13.5 3.5Z'),
  path('M13.5 3.5v4a2 2 0 0 0 2 2h4'),
];
const THUMB = [path('M8.5 10.5 12 4a1.5 1.5 0 0 1 2.8.8l-.5 5.7h4.2a2 2 0 0 1 1.9 2.5L19 18.5a2.5 2.5 0 0 1-2.4 2H8.5M8.5 10.5H5a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 5 20.5h3.5v-10Z')];

const GLYPHS = {
  newChat: [path('M11 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4'), ...PENCIL],
  edit: PENCIL,
  library: [path('M7.5 4h10A2.5 2.5 0 0 1 20 6.5v13a.5.5 0 0 1-.5.5h-12A3.5 3.5 0 0 1 4 16.5v-9A3.5 3.5 0 0 1 7.5 4ZM4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 4v10M9 17h6')],
  folder: [path('M3.5 8V7A2.5 2.5 0 0 1 6 4.5h3a2 2 0 0 1 1.6.8l1.2 1.4a2 2 0 0 0 1.6.8H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V8Z')],
  clock: [circle(12, 12, 8.25), path('M12 7.5V12l3 2')],
  puzzle: [path('M9 4.5H6.5a2 2 0 0 0-2 2V10H6a2 2 0 0 1 0 4H4.5v3.5a2 2 0 0 0 2 2H10V18a2 2 0 0 1 4 0v1.5h3.5a2 2 0 0 0 2-2V14H18a2 2 0 0 1 0-4h1.5V6.5a2 2 0 0 0-2-2H14V4a2.5 2.5 0 0 0-5 0v.5Z')],
  image: [rect(3.5, 3.5, 17, 17, 4), circle(8.5, 8.5, 1.5), path('M4 17.5 8 13a2 2 0 0 1 3 0l2 2 1.5-1.5a2 2 0 0 1 3 0l3 3.5')],
  assistant: [rect(3.5, 3.5, 17, 17, 6), dot(8.5, 10), dot(15.5, 10), path('M9 14.5c1.7 1.5 4.3 1.5 6 0')],
  site: [rect(3.5, 4.5, 17, 15, 3), path('M3.5 9.5h17M9 9.5v10'), dot(6.75, 7, .65), dot(9.5, 7, .65)],
  exam: [rect(5, 4.5, 14, 16, 3), rect(9, 2.5, 6, 4, 1.5), path('m8.5 13 2.5 2.5 4.5-5')],
  skills: [rect(4, 4, 6, 6, 2), rect(14, 4, 6, 6, 2), rect(4, 14, 6, 6, 2), path('M17 13c.4 2.3 1.7 3.6 4 4-2.3.4-3.6 1.7-4 4-.4-2.3-1.7-3.6-4-4 2.3-.4 3.6-1.7 4-4Z')],
  more: [dot(5, 12, 1.5), dot(12, 12, 1.5), dot(19, 12, 1.5)],
  search: [circle(10.75, 10.75, 6.75), path('m16 16 4.5 4.5')],
  panel: [rect(3.5, 4.5, 17, 15, 3), path('M9 4.5v15')],
  close: [path('m7 7 10 10M17 7 7 17')],
  knowledge: [circle(6, 6, 2.5), circle(18, 8, 2.5), circle(10.5, 18, 2.5), path('m8.5 6.4 7 1.2M6.9 8.4l2.7 7.2m6.9-5.7-4.4 6.2')],
  bookmark: [path('M8 3.5h8A2.5 2.5 0 0 1 18.5 6v13.5a.75.75 0 0 1-1.2.6L12 16l-5.3 4.1a.75.75 0 0 1-1.2-.6V6A2.5 2.5 0 0 1 8 3.5Z')],
  chevronRight: [path('m9 7 5 5-5 5')],
  chevronLeft: [path('m15 7-5 5 5 5')],
  chevronDown: [path('m7 9.5 5 5 5-5')],
  chevronUp: [path('m7 14.5 5-5 5 5')],
  share: [path('M4.5 13v4.5a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V13M12 15V3.5m-4 4 4-4 4 4')],
  archive: [rect(3.5, 4, 17, 5, 1.5), path('M5 9v8.5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9M10 13h4')],
  trash: [path('M4.5 6.5h15M6 6.5l.7 11.7a2.5 2.5 0 0 0 2.5 2.3h5.6a2.5 2.5 0 0 0 2.5-2.3L18 6.5M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5M10 10.5v6M14 10.5v6')],
  sun: [circle(12, 12, 3.75), path('M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1m10.8 10.8 1 1M5.6 18.4l1-1M17.4 6.6l1-1')],
  moon: [path('M20.2 13.7A8.5 8.5 0 0 1 10.3 3.8a8.5 8.5 0 1 0 9.9 9.9Z')],
  sliders: [path('M4 7h7m4 0h5M4 17h3m4 0h9'), circle(13, 7, 2), circle(9, 17, 2)],
  gear: [path('m9.5 4 .5-1h4l.5 1 .6 1.8 1.9.5 1.8-.4 2 3.4-1.3 1.3-.5 1.4.5 1.4 1.3 1.3-2 3.4-1.8-.4-1.9.5-.6 1.8-.5 1h-4l-.5-1-.6-1.8-1.9-.5-1.8.4-2-3.4 1.3-1.3.5-1.4-.5-1.4-1.3-1.3 2-3.4 1.8.4 1.9-.5.6-1.8Z'), circle(12, 12, 3)],
  tag: [path('M4 6.5V11a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l5-5a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 11 4H6.5A2.5 2.5 0 0 0 4 6.5Z'), dot(8, 8)],
  pin: [path('m14 3 7 7-2.5.5-3.8 3.8.3 3.7-9-9 3.7.3L13.5 5.5 14 3ZM10.5 13.5 4 20')],
  globe: [circle(12, 12, 8.5), path('M3.5 12h17M12 3.5c4.5 4.7 4.5 12.3 0 17-4.5-4.7-4.5-12.3 0-17Z')],
  compass: [circle(12, 12, 8.5), path('m15.9 8.1-2.2 5.6-5.6 2.2 2.2-5.6 5.6-2.2Z')],
  research: [circle(10.75, 10.75, 6.75), path('m16 16 4.5 4.5M8 10.5l2 2 3.5-3.5')],
  analyze: [path('M5 19.5v-6M12 19.5v-15M19 19.5v-10')],
  paperclip: [path('m8.5 12.5 6-6a2.5 2.5 0 0 1 3.5 3.5L10 18a4 4 0 0 1-5.7-5.7l8.5-8.5a5.5 5.5 0 0 1 7.8 7.8l-8 8')],
  thinking: [path('M12 5.5a3 3 0 0 0-5.7-1.3A3.5 3.5 0 0 0 4 10a4 4 0 0 0 .5 6.5A3.5 3.5 0 0 0 12 18V5.5Zm0 0a3 3 0 0 1 5.7-1.3A3.5 3.5 0 0 1 20 10a4 4 0 0 1-.5 6.5A3.5 3.5 0 0 1 12 18M8 8a3 3 0 0 1-2 3m10-3a3 3 0 0 0 2 3M8 15a3 3 0 0 0-3.5 1.5M16 15a3 3 0 0 1 3.5 1.5')],
  camera: [path('M8 5.5 9.5 3.5h5l1.5 2h2A2.5 2.5 0 0 1 20.5 8v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V8A2.5 2.5 0 0 1 6 5.5h2Z'), circle(12, 13, 3.5)],
  plus: [path('M12 5v14M5 12h14')],
  microphone: [rect(9, 3.5, 6, 11, 3), path('M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6')],
  arrowUp: [path('M12 19V5m-6 6 6-6 6 6')],
  arrowDown: [path('M12 5v14m-6-6 6 6 6-6')],
  copy: [rect(8, 8, 12.5, 12.5, 3), path('M15.5 5.5A2 2 0 0 0 13.5 3.5h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2')],
  check: [path('m5.5 12 4.5 4.5 8.5-9')],
  regenerate: [path('M4 10a8 8 0 0 1 13.7-3.7L20 8.5M20 4v4.5h-4.5M20 14A8 8 0 0 1 6.3 17.7L4 15.5M4 20v-4.5h4.5')],
  thumbsUp: THUMB,
  thumbsDown: THUMB.map(([tag, attrs]): IconShape => [tag, { ...attrs, transform: 'rotate(180 12 12)' }]),
  branch: [path('M6 4v11.5M18 8.5A9.5 9.5 0 0 1 8.5 18'), circle(6, 18, 2.5), circle(18, 6, 2.5)],
  bulb: [path('M9 16c0-1.5-.8-2.5-1.8-3.5a6 6 0 1 1 9.6 0C15.8 13.5 15 14.5 15 16M9 17h6M10 20.5h4')],
  speaker: [path('M10.5 5 6 8.5H4a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h2l4.5 3.5a.6.6 0 0 0 1-.5v-13a.6.6 0 0 0-1-.5ZM15.5 9a4.5 4.5 0 0 1 0 6M18 6a8.5 8.5 0 0 1 0 12')],
  document: DOCUMENT,
  read: [...DOCUMENT, path('M8.5 13.5h7M8.5 17h4')],
  code: [path('m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14')],
  agent: [rect(4, 7, 16, 13, 5), path('M12 7V3.5M2 13.5h2M20 13.5h2'), dot(8.5, 12.5), dot(15.5, 12.5), path('M9 16h6')],
} satisfies Record<string, readonly IconShape[]>;

export type InterfaceIconName = keyof typeof GLYPHS;

export function getInterfaceIconShapes(name: InterfaceIconName): readonly IconShape[] {
  return Object.prototype.hasOwnProperty.call(GLYPHS, name) ? GLYPHS[name] : [];
}

/** Only the static, trusted shape attributes above are serialized. */
export function interfaceIconInnerHtml(name: InterfaceIconName): string {
  return getInterfaceIconShapes(name).map(([tag, attrs]) => {
    const attributes = Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ');
    return `<${tag} ${attributes}/>`;
  }).join('');
}

export function interfaceIcon(name: InterfaceIconName, size?: number): string {
  const body = interfaceIconInnerHtml(name);
  if (!body) return '';
  const dimensions = size === undefined ? '' : ` width="${size}" height="${size}"`;
  return `<svg viewBox="0 0 24 24"${dimensions} fill="none" stroke="currentColor" stroke-width="${INTERFACE_ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
