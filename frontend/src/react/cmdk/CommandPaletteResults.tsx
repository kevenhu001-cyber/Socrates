import { useMemo } from 'react';
import { fill, t } from './text';
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
  if (doc.kind === 'message') return t('chrome.cmdkKindMessage', 'Message');
  return (doc as { mode?: string }).mode === 'chat'
    ? t('chrome.cmdkKindChat', 'Chat')
    : t('chrome.cmdkKindTutor', 'Tutor');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function RecentSection({ recent, onPickRecent }: Pick<CommandPaletteResultsProps, 'recent' | 'onPickRecent'>) {
  const label = t('chrome.cmdkRecent', 'Recent');
  return (
    <div className="cmd-k-section">
      <div className="cmd-k-section-label">{label}</div>
      {recent.slice(0, 5).map((item) => (
        <div key={item} className="cmd-k-row" data-recent={escapeAttribute(item)} onClick={() => onPickRecent(item)}>
          <div className="cmd-k-row-title">{item}</div>
          <div className="cmd-k-row-meta">{label}</div>
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
  if (!hasQuery) return <div className="cmd-k-empty">{t('chrome.cmdkEmpty', 'Type to search across all your sessions.')}</div>;
  if (hitViews.length === 0) {
    return (
      <div className="cmd-k-empty">
        {t('chrome.cmdkNoResultsPre', 'No results. Press')} <kbd>↵</kbd>{' '}
        {t('chrome.cmdkNoResultsPost', 'to search on the server.')}
      </div>
    );
  }

  return (
    <div className="cmd-k-section">
      <div className="cmd-k-section-label">
        {hitViews.length === 1
          ? fill(t('chrome.cmdkResultsOne', '1 result for {query}'), { query: `“${query}”` })
          : fill(t('chrome.cmdkResultsMany', '{count} results for {query}'), {
              count: hitViews.length,
              query: `“${query}”`,
            })}
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
