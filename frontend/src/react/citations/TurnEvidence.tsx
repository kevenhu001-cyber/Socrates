import { isCitableTurnRange } from '@socrates/core';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import type { TurnRuntime } from '@socrates/contracts';
import { i18n } from '../legacy/gateway';

const PREFIX = '#socrates-citation-';

/** Links are inserted from validated annotations, never guessed from [n] text. */
export function TurnEvidence({ runtime, text, children }: { runtime?: TurnRuntime | null; text: string; children: ReactNode }) {
  const [preview, setPreview] = useState<{ claimId: string; left: number; top: number; pinned: boolean } | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const suppressFocus = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelHoverClose = () => clearTimeout(hoverTimer.current);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const sources = runtime?.sources || [];
  const citations = runtime?.citations || [];
  const validClaims = (runtime?.claims || []).filter((entry) => text.slice(entry.start, entry.end) === entry.quote && isCitableTurnRange(text, entry.start, entry.end));
  const claim = validClaims.find((entry) => entry.id === preview?.claimId);
  const citedSources = sources.filter((source) => citations.some((citation) => citation.sourceId === source.id && validClaims.some((entry) => entry.citationIds.includes(citation.id))));
  const previewSources = sources.filter((source) => claim?.citationIds.some((id) => citations.some((citation) => citation.id === id && citation.sourceId === source.id)));

  useEffect(() => {
    if (!preview) return;
    if (preview.pinned) dialogRef.current?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPreview(null);
      if (preview.pinned) {
        suppressFocus.current = true;
        anchorRef.current?.focus();
        suppressFocus.current = false;
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && (dialogRef.current?.contains(event.target) || anchorRef.current?.contains(event.target))) return;
      setPreview(null);
    };
    const moved = () => setPreview(null);
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved, true);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', moved);
      window.removeEventListener('scroll', moved, true);
    };
  }, [preview]);

  const show = (event: SyntheticEvent, pinned = false) => {
    if (suppressFocus.current || !(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>(`a[href^="${PREFIX}"]`);
    if (!anchor) return;
    // A fragment alone cannot supply citation metadata.
    const claimId = anchor.getAttribute('href')!.slice(PREFIX.length);
    if (!validClaims.some((entry) => entry.id === claimId)) return;
    if (pinned) { event.preventDefault(); event.stopPropagation(); }
    if (!pinned && preview?.pinned) return;
    if (preview?.claimId === claimId && preview.pinned === pinned) return;
    anchorRef.current = anchor;
    const rect = anchor.getBoundingClientRect();
    setPreview({ claimId, left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)), top: rect.bottom + 8, pinned });
  };

  const hoverClose = () => {
    if (!preview?.pinned) hoverTimer.current = setTimeout(() => setPreview(null), 150);
  };

  // Keep the preview clear of its own citation. A popover that covers the
  // trigger cannot be dismissed: removing it hands the pointer back to the
  // citation, the browser re-fires mouseover and the preview opens again.
  // Sit below the citation, and flip above it when the viewport has no room.
  useLayoutEffect(() => {
    if (!preview) return;
    const node = dialogRef.current;
    const anchor = anchorRef.current;
    if (!node || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = node.offsetHeight;
    const gap = 8;
    const below = rect.bottom + gap;
    const top = below + height > window.innerHeight - 16 ? Math.max(16, rect.top - gap - height) : below;
    if (top !== preview.top) setPreview((current) => (current ? { ...current, top } : current));
  }, [preview]);

  return <div className="turn-evidence" onClick={(event) => show(event, true)} onMouseOver={show} onFocus={show}
    onMouseEnter={cancelHoverClose} onMouseLeave={hoverClose}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !dialogRef.current?.contains(event.relatedTarget as Node | null)) setPreview(null); }}>
    {children}
    {preview && previewSources.length ? createPortal(<aside ref={dialogRef} className="turn-source-preview" role="dialog" onMouseEnter={cancelHoverClose} onMouseLeave={hoverClose} aria-label={i18n('citation.preview', 'Source preview')} tabIndex={-1}
      style={{ left: preview.left, top: preview.top }}>
      {previewSources.map((source) => <div key={source.id}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
        <small>{new URL(source.url).hostname}</small>
        {source.snippet ? <p>{source.snippet}</p> : null}
      </div>)}
    </aside>, document.body) : null}
    {citedSources.length ? <details className="turn-sources" data-source-count={citedSources.length}>
      <summary aria-label={`${i18n('citation.sources', 'Sources')} · ${citedSources.length}`}>
        <svg className="turn-sources-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 2.5h5.5L12 5v8.5H4z" />
          <path d="M9.5 2.5V5H12M6 8h4M6 10.5h4" />
        </svg>
        <span className="turn-sources-label">{i18n('citation.sources', 'Sources')}</span>
        <span className="turn-sources-divider" aria-hidden="true">·</span>
        <span className="turn-sources-count" aria-hidden="true">{citedSources.length}</span>
        <svg className="turn-sources-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </summary>
      <ol aria-label={i18n('citation.sources', 'Sources')}>{citedSources.map((source) => <li key={source.id} value={sources.indexOf(source) + 1}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
        <small>{new URL(source.url).hostname}</small>
        {source.snippet ? <p>{source.snippet}</p> : null}
      </li>)}</ol>
    </details> : null}
  </div>;
}
