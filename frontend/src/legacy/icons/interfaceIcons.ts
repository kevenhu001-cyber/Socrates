/** Shared interface glyphs for React and the remaining string renderers.
 * 24px grid, 1.75px round strokes, generous counters and quiet rounded shells.
 * Keep brand marks and user-created SVG content outside this collection.
 */
export const INTERFACE_ICON_STROKE = 1.75;

type ShapeTag = 'path' | 'rect' | 'circle';
export type IconShape = readonly [ShapeTag, Readonly<Record<string, string | number>>];
const path = (d: string, attrs: Record<string, string | number> = {}): IconShape => [
  'path',
  { d, ...attrs },
];
const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => [
  'rect',
  { x, y, width, height, rx },
];
const circle = (cx: number, cy: number, r: number): IconShape => ['circle', { cx, cy, r }];

const PENCIL = [
  path(
    'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.85l-.9 3.8a.5.5 0 0 0 .6.6l3.8-.9a2 2 0 0 0 .85-.5z',
  ),
];
const DOCUMENT = [
  path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'),
  path('M14 2v6h6'),
];
const THUMB = [
  path(
    'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3Z',
  ),
];

const GLYPHS = {
  newChat: [
    path('M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'),
    path(
      'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z',
    ),
  ],
  edit: PENCIL,
  library: [path('m16 6 4 14'), path('M12 6v14'), path('M8 8v12'), path('M4 4v16')],
  folder: [
    path(
      'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    ),
  ],
  clock: [circle(12, 12, 9), path('M12 7v5l3 2')],
  puzzle: [
    path(
      'M19.4 7.85c-.05-.32.06-.65.29-.88l1.57-1.57a1.5 1.5 0 0 0-2.12-2.12l-1.57 1.57a.86.86 0 0 1-.88.29c-.77-.16-1.56.12-2.03.74a2.5 2.5 0 0 0-4 0c-.47-.62-1.26-.9-2.03-.74a.86.86 0 0 1-.88-.29L6.12 3.28a1.5 1.5 0 0 0-2.12 2.12l1.57 1.57c.23.23.34.56.29.88-.16.77.12 1.56.74 2.03a2.5 2.5 0 0 0 0 4c-.62.47-.9 1.26-.74 2.03.05.32-.06.65-.29.88l-1.57 1.57a1.5 1.5 0 0 0 2.12 2.12l1.57-1.57c.23-.23.56-.34.88-.29.77.16 1.56-.12 2.03-.74a2.5 2.5 0 0 0 4 0c.47.62 1.26.9 2.03.74.32.05.65-.06.88-.29l1.57 1.57a1.5 1.5 0 0 0 2.12-2.12l-1.57-1.57a.86.86 0 0 1-.29-.88c.16-.77-.12-1.56-.74-2.03a2.5 2.5 0 0 0 0-4c.62-.47.9-1.26.74-2.03Z',
    ),
  ],
  image: [rect(3, 3, 18, 18, 2.5), circle(8.5, 8.5, 1.5), path('m21 15-5-5L5 21')],
  assistant: [rect(4, 6, 16, 14, 4), path('M12 2v4M8 12h.01M16 12h.01M9 16c1.5 1 4.5 1 6 0')],
  site: [rect(3, 4, 18, 16, 3), path('M3 9h18M7 6.5h.01M10 6.5h.01M13 6.5h.01')],
  exam: [rect(4, 3, 16, 18, 2.5), path('M9 12l2 2 4-4M8 3h8')],
  skills: [rect(3, 3, 8, 8, 2), circle(17, 7, 4), rect(13, 13, 8, 8, 2), path('m3 21 4-7 4 7z')],
  /* The reference ⋯: three round dots. */
  more: [circle(6, 12, 1.5), circle(12, 12, 1.5), circle(18, 12, 1.5)],
  search: [circle(11, 11, 7), path('m21 21-4.35-4.35')],
  // Web activity is distinct from local conversation search.
  webSearch: [
    circle(10.5, 10.5, 7),
    path('M3.5 10.5h14M10.5 3.5c-2 2-3 4.3-3 7s1 5 3 7m0-14c2 2 3 4.3 3 7s-1 5-3 7M16 16l4.5 4.5'),
  ],
  activityTools: [
    path('M4 6h4m4 0h8M4 12h10m4 0h2M4 18h6m4 0h6'),
    circle(10, 6, 2),
    circle(16, 12, 2),
    circle(12, 18, 2),
  ],
  panel: [rect(3, 3, 18, 18, 3), path('M9 3v18')],
  close: [path('M18 6 6 18M6 6l12 12')],
  knowledge: [
    circle(6, 6, 2.5),
    circle(18, 8, 2.5),
    circle(11, 18, 2.5),
    path('m8.5 6.4 7 1.2M7.2 8.3l2.8 7.4M16.5 10l-4 6'),
  ],
  bookmark: [path('M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z')],
  chevronRight: [path('m9 18 6-6-6-6')],
  chevronLeft: [path('m15 18-6-6 6-6')],
  chevronDown: [path('m6 9 6 6 6-6')],
  chevronUp: [path('m18 15-6-6-6 6')],
  list: [path('M4 6h3M4 12h3M4 18h3'), path('M10 6h10M10 12h10M10 18h10')],
  user: [circle(12, 8, 3.25), path('M5.5 20v-1a6.5 6.5 0 0 1 13 0v1')],
  lifeBuoy: [
    circle(12, 12, 8.5),
    circle(12, 12, 3.25),
    path('m6 6 3.7 3.7m4.6 4.6L18 18M18 6l-3.7 3.7m-4.6 4.6L6 18'),
  ],
  /* Door frame on the left, arrow leaving to the right. */
  logOut: [path('M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M15 7l5 5-5 5M20 12H9')],
  share: [path('M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7'), path('m16 6-4-4-4 4M12 2v13')],
  archive: [rect(3, 4, 18, 5, 2), path('M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4')],
  trash: [
    path(
      'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
    ),
  ],
  sun: [
    circle(12, 12, 4),
    path(
      'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
    ),
  ],
  moon: [path('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z')],
  sliders: [path('M3 8h8M15 8h6M3 16h4M11 16h10'), circle(13, 8, 2), circle(9, 16, 2)],
  gear: [
    path(
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    ),
    circle(12, 12, 3),
  ],
  tag: [
    path(
      'M4 6.5V11a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l5-5a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 11 4H6.5A2.5 2.5 0 0 0 4 6.5Z',
    ),
  ],
  pin: [
    path(
      'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.76z',
    ),
  ],
  globe: [circle(12, 12, 9), path('M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18')],
  compass: [circle(12, 12, 8.5), path('m15.9 8.1-2.2 5.6-5.6 2.2 2.2-5.6 5.6-2.2Z')],
  research: [circle(11, 11, 7), path('m21 21-4.35-4.35M8 10.5l2 2 3.5-3.5')],
  analyze: [path('M5 19.5v-6M12 19.5v-15M19 19.5v-10')],
  paperclip: [
    path(
      'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
    ),
  ],
  // A compact reasoning spark, not the brain or the loading spinner.
  thinking: [
    path('M10 3.5c.8 4.1 2.4 5.7 6.5 6.5-4.1.8-5.7 2.4-6.5 6.5-.8-4.1-2.4-5.7-6.5-6.5 4.1-.8 5.7-2.4 6.5-6.5Z'),
    path('M18.5 13.5v6M15.5 16.5h6M19 3.5v3M17.5 5h3'),
  ],
  camera: [
    path(
      'M8 5.5 9.5 3.5h5l1.5 2h2A2.5 2.5 0 0 1 20.5 8v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V8A2.5 2.5 0 0 1 6 5.5h2Z',
    ),
    circle(12, 13, 3.5),
  ],
  plus: [path('M12 5v14M5 12h14')],
  microphone: [rect(9, 3, 6, 11, 3), path('M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8')],
  arrowUp: [path('M12 19V5M5 12l7-7 7 7')],
  arrowDown: [path('M12 5v14M5 12l7 7 7-7')],
  copy: [rect(9, 9, 12, 12, 2), path('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')],
  check: [path('m5 12 5 5L20 7')],
  regenerate: [
    path(
      'M4 10a8 8 0 0 1 13.7-3.7L20 8.5M20 4v4.5h-4.5M20 14A8 8 0 0 1 6.3 17.7L4 15.5M4 20v-4.5h4.5',
    ),
  ],
  thumbsUp: THUMB,
  thumbsDown: THUMB.map(([tag, attrs]): IconShape => [
    tag,
    { ...attrs, transform: 'rotate(180 12 12)' },
  ]),
  branch: [path('M6 4v11.5M18 8.5A9.5 9.5 0 0 1 8.5 18'), circle(6, 18, 2.5), circle(18, 6, 2.5)],
  bulb: [
    path('M9 16c0-1.5-.8-2.5-1.8-3.5a6 6 0 1 1 9.6 0C15.8 13.5 15 14.5 15 16M9 17h6M10 20.5h4'),
  ],
  speaker: [
    path(
      'M10.5 5 6 8.5H4a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h2l4.5 3.5a.6.6 0 0 0 1-.5v-13a.6.6 0 0 0-1-.5ZM15.5 9a4.5 4.5 0 0 1 0 6M18 6a8.5 8.5 0 0 1 0 12',
    ),
  ],
  document: DOCUMENT,
  read: [...DOCUMENT, path('M8.5 13.5h7M8.5 17h4')],
  code: [path('m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14')],
  agent: [
    rect(4, 7, 16, 13, 5),
    path('M12 7V3.5M2 13.5h2M20 13.5h2'),
    path('M8.5 11.5v2M15.5 11.5v2'),
    path('M9 16h6'),
  ],
  upload: [rect(4, 4, 16, 16, 3), path('M12 16V8m-3.5 3.5 3.5-3.5 3.5 3.5')],
  wechat: [
    path(
      'M10 5.5C6.4 5.5 3.5 7.9 3.5 10.8c0 1.6.8 3 2.1 4l-.6 2.2 2.5-1.2c.8.3 1.6.4 2.5.4 3.6 0 6.5-2.4 6.5-5.4S13.6 5.5 10 5.5Z',
    ),
    circle(8, 10, 0.9),
    circle(12, 10, 0.9),
    path(
      'M16 11.5c-2.8 0-5 1.8-5 4 0 1.2.6 2.3 1.6 3l-.5 1.7 1.9-.9c.6.2 1.3.3 2 .3 2.8 0 5-1.8 5-4s-2.2-4.1-5-4.1Z',
    ),
    circle(14.5, 15, 0.8),
    circle(17.5, 15, 0.8),
  ],
  plug: [
    path(
      'm19 5-3-3m-6 6L7.5 5.5M12 12l2.5 2.5M6 18l3-3m-1-4 5.5-5.5a2.5 2.5 0 0 1 3.5 3.5L8.5 14a2.5 2.5 0 0 1-3.5-3.5Z',
    ),
  ],
  skillsBadge: [
    rect(5, 3.5, 14, 17, 3),
    path('M8.5 14c1.2-2 2.3-2 3.5 0s2.3 2 3.5 0'),
    circle(12, 8.5, 1.5),
  ],
} satisfies Record<string, readonly IconShape[]>;

export type InterfaceIconName = keyof typeof GLYPHS;

export function getInterfaceIconShapes(name: InterfaceIconName): readonly IconShape[] {
  return Object.prototype.hasOwnProperty.call(GLYPHS, name) ? GLYPHS[name] : [];
}

/** Only the static, trusted shape attributes above are serialized. */
export function interfaceIconInnerHtml(name: InterfaceIconName): string {
  return getInterfaceIconShapes(name)
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${attributes}/>`;
    })
    .join('');
}

export function interfaceIcon(name: InterfaceIconName, size?: number): string {
  const body = interfaceIconInnerHtml(name);
  if (!body) return '';
  const dimensions = size === undefined ? '' : ` width="${size}" height="${size}"`;
  return `<svg viewBox="0 0 24 24"${dimensions} fill="none" stroke="currentColor" stroke-width="${INTERFACE_ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
