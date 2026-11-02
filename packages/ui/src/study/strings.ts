/**
 * Copy for the RN-5 study panels. Hosts translate (the web shell reads its
 * i18n tables); these English defaults keep native and tests readable.
 * `{n}`, `{a}`, `{b}`, `{name}` are replaced by `fill()`.
 */
import type { KnowledgeStatus } from './model';

export interface KnowledgeStrings {
  title: string;
  lastUpdated: string;
  snapshot: string;
  graphLabel: string;
  caption: string;
  status: Record<KnowledgeStatus, string>;
  section: Record<KnowledgeStatus, string>;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  verifiedTag: string;
  questions: string;
  systemTag: string;
  userTag: string;
  history: string;
  empty: string;
  detail: {
    close: string;
    go: string;
    goTitle: string;
    confidence: string;
    confidenceSet: string;
    systemNote: string;
    noSystemNote: string;
    yourNote: string;
    notePlaceholder: string;
    history: string;
    noHistory: string;
    connections: string;
    noConnections: string;
    before: string;
    after: string;
    whyBefore: string;
    whyAfter: string;
    open: string;
  };
}

export const defaultKnowledgeStrings: KnowledgeStrings = {
  title: 'Knowledge boundary',
  lastUpdated: 'Last updated',
  snapshot: 'Save this version',
  graphLabel: 'Knowledge map',
  caption: 'Darker = better mastered · lines follow your learning path',
  status: { internalized: 'Internalized', fuzzy: 'Fuzzy', blank: 'Blank' },
  section: { internalized: 'Internalized', fuzzy: 'Fuzzy', blank: 'Not probed' },
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to view',
  verifiedTag: 'Verified ×{n}',
  questions: '{n} questions',
  systemTag: 'System',
  userTag: 'Me',
  history: 'Snapshot history',
  empty: 'Set a topic to build your knowledge map.',
  detail: {
    close: 'Close',
    go: '→ Go',
    goTitle: 'Jump to this node and continue',
    confidence: 'Confidence',
    confidenceSet: 'Set confidence to {n}',
    systemNote: 'System note',
    noSystemNote: 'No system note yet',
    yourNote: 'My note',
    notePlaceholder: 'Write what you still find unclear…',
    history: 'Snapshot history',
    noHistory: 'No snapshots yet',
    connections: 'Connections',
    noConnections: 'This is the only idea on the map so far.',
    before: 'Comes before',
    after: 'Comes next',
    whyBefore: '“{a}” comes right before “{b}” on your learning path, so it is the ground “{b}” stands on.',
    whyAfter: '“{b}” comes right after “{a}” on your learning path; it builds on what you settle here.',
    open: 'Open {name}',
  },
};

export interface MistakeStrings {
  title: string;
  filterLabel: string;
  filter: { all: string; unresolved: string; resolved: string };
  empty: string;
  emptyHint: string;
  filterEmptyResolved: string;
  filterEmptyOther: string;
  conquered: string;
  redo: string;
  redoneOne: string;
  redoneMany: string;
  yourAnswer: string;
  correctAnswer: string;
  noAnswer: string;
  showDetail: string;
  hideDetail: string;
  options: string;
  untitledTopic: string;
  typeLabel: (type: string) => string;
  time: (timestamp: number) => string;
}

export const defaultMistakeStrings: MistakeStrings = {
  title: 'Mistake Book',
  filterLabel: 'Filter mistakes',
  filter: { all: 'All', unresolved: 'Unresolved', resolved: 'Resolved' },
  empty: 'No mistakes yet',
  emptyHint: 'Mistakes you make will appear here.',
  filterEmptyResolved: 'No conquered mistakes yet.',
  filterEmptyOther: 'No unresolved mistakes.',
  conquered: 'Conquered',
  redo: 'Redo',
  redoneOne: 'Redone 1 time',
  redoneMany: 'Redone {n} times',
  yourAnswer: 'Why it went wrong',
  correctAnswer: 'The right way',
  noAnswer: 'No answer recorded',
  showDetail: 'Show answers',
  hideDetail: 'Hide answers',
  options: 'Options',
  untitledTopic: 'Other',
  typeLabel: (type) => type,
  time: () => '',
};

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
