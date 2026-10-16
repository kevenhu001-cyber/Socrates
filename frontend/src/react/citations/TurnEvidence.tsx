import { isCitableTurnRange } from '@socrates/core';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
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
    setPreview({ claimId, left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)), top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 300)), pinned });
  };

  const hoverClose = () => {
    if (!preview?.pinned) hoverTimer.current = setTimeout(() => setPreview(null), 150);
  };

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
    {citedSources.length ? <details className="turn-sources">
      <summary>{i18n('citation.sources', 'Sources')} · {citedSources.length}</summary>
      <ol>{citedSources.map((source) => <li key={source.id} value={sources.indexOf(source) + 1}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
        <small>{new URL(source.url).hostname}</small>
        {source.snippet ? <p>{source.snippet}</p> : null}
      </li>)}</ol>
    </details> : null}
  </div>;
}
