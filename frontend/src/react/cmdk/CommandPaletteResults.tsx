import { useMemo } from 'react';
import type { CmdKDoc, CmdKHit } from './types';

interface CommandPaletteResultsProps {
  query: string;
  recent: ReadonlyArray<string>;
  results: ReadonlyArray<CmdKHit>;
  selectedIndex: number;
  onPickRecent: (value: string) => void;
  onActivate: (index: number) => void;
}

interface CmdKDocView {
  kind: string;
  meta: string;
  title: string;
  snippet: string;
  id: string;
}

function docFromHit(hit: CmdKHit): CmdKDoc | null {
  if (hit.item) return hit.item;
  // Legacy code occasionally pushes raw remote docs without wrapping in
  // `{ item }`. Treat any object with a `kind` as a doc.
  const candidate = hit as unknown as CmdKDoc;
  return typeof candidate.kind === 'string' ? candidate : null;
}

function metaFor(doc: CmdKDoc): string {
  if (doc.kind === 'message') return 'Message';
  return (doc as { mode?: string }).mode === 'chat' ? 'Chat' : 'Tutor';
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function RecentSection({ recent, onPickRecent }: Pick<CommandPaletteResultsProps, 'recent' | 'onPickRecent'>) {
  return (
    <div className="cmd-k-section">
      <div className="cmd-k-section-label">Recent</div>
      {recent.slice(0, 5).map((item) => (
        <div key={item} className="cmd-k-row" data-recent={escapeAttribute(item)} onClick={() => onPickRecent(item)}>
          <div className="cmd-k-row-title">{item}</div>
          <div className="cmd-k-row-meta">Recent</div>
        </div>
      ))}
    </div>
  );
}

export function CommandPaletteResults({
  query,
  recent,
  results,
  selectedIndex,
  onPickRecent,
  onActivate,
}: CommandPaletteResultsProps) {
  const hasQuery = query.trim().length > 0;
  const hitViews = useMemo(() => results.map((hit, idx): { view: CmdKDocView | null; idx: number } => {
    const doc = docFromHit(hit);
    if (!doc) return { view: null, idx };
    return {
      view: {
        kind: doc.kind,
        meta: metaFor(doc),
        title: doc.title ?? '',
        snippet: doc.snippet ?? '',
        id: doc.id ?? '',
      },
      idx,
    };
  }), [results]);

  if (!hasQuery && recent.length > 0) return <RecentSection recent={recent} onPickRecent={onPickRecent} />;
  if (!hasQuery) return <div className="cmd-k-empty">Type to search across all your sessions.</div>;
  if (hitViews.length === 0) {
    return <div className="cmd-k-empty">No results. Press <kbd>↵</kbd> to search on the server.</div>;
  }

  return (
    <div className="cmd-k-section">
      <div className="cmd-k-section-label">
        {hitViews.length} result{hitViews.length === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
      </div>
      {hitViews.map(({ view, idx }) => view === null ? null : (
        <div
          key={`${view.kind}:${view.id}:${idx}`}
          className={'cmd-k-row' + (idx === selectedIndex ? ' selected' : '')}
          data-idx={idx}
          data-kind={view.kind}
          data-id={view.id}
          onClick={() => onActivate(idx)}
          onMouseEnter={() => onActivate(idx)}
        >
          <div className="cmd-k-row-title">{view.title}</div>
          <div className="cmd-k-row-snippet">{view.snippet}</div>
          <div className="cmd-k-row-meta">{view.meta}</div>
        </div>
      ))}
    </div>
  );
}
