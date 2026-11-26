import { isCitableTurnRange } from '@socrates/core';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { TurnRuntime } from '@socrates/contracts';
import { i18n } from '../../ui/legacyI18n.ts';
import { SourceAvatar } from '../sources/SourceAvatar';
import { MathText } from '../rn/useInlineMath';
import { TurnSources } from './TurnSources';

const PREFIX = '#socrates-citation-';

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

type PreviewState = {
  claimId: string;
  left: number;
  top: number;
  pinned: boolean;
};

type TurnSourceItem = NonNullable<TurnRuntime['sources']>[number];
type TurnCitationItem = NonNullable<TurnRuntime['citations']>[number];
type TurnClaimItem = NonNullable<TurnRuntime['claims']>[number];

function resolvePreviewSources(
  sources: TurnSourceItem[],
  citations: TurnCitationItem[],
  validClaims: TurnClaimItem[],
  preview: PreviewState | null,
): TurnSourceItem[] {
  const claim = validClaims.find((entry) => entry.id === preview?.claimId);
  if (claim) {
    return sources.filter((source) =>
      claim.citationIds.some((id) =>
        citations.some((citation) => citation.id === id && citation.sourceId === source.id),
      ),
    );
  }
  if (preview?.claimId?.startsWith('source-')) {
    return sources.filter((source, idx) => {
      const key = preview.claimId.slice('source-'.length);
      const num = Number(key);
      if (Number.isSafeInteger(num) && num > 0) return idx === num - 1;
      return source.id === key || source.id === preview.claimId;
    });
  }
  return [];
}

function useSourcePreviewDismiss(
  preview: PreviewState | null,
  dialogRef: React.RefObject<HTMLElement | null>,
  anchorRef: React.RefObject<HTMLAnchorElement | null>,
  suppressFocus: React.MutableRefObject<boolean>,
  setPreview: (val: PreviewState | null) => void,
) {
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
      if (
        event.target instanceof Node &&
        (dialogRef.current?.contains(event.target) || anchorRef.current?.contains(event.target))
      )
        return;
      setPreview(null);
    };
    const moved = (event: Event) => {
      // Scrolling a long source preview must not dismiss that preview.
      if (event.target instanceof Node && dialogRef.current?.contains(event.target)) return;
      setPreview(null);
    };
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
  }, [preview, dialogRef, anchorRef, suppressFocus, setPreview]);
}

function useSourcePreviewPosition(
  preview: PreviewState | null,
  dialogRef: React.RefObject<HTMLElement | null>,
  anchorRef: React.RefObject<HTMLAnchorElement | null>,
  setPreview: React.Dispatch<React.SetStateAction<PreviewState | null>>,
) {
  useLayoutEffect(() => {
    if (!preview) return;
    const node = dialogRef.current;
    const anchor = anchorRef.current;
    if (!node || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = node.offsetHeight;
    const gap = 8;
    const below = rect.bottom + gap;
    const maxTop = Math.max(16, window.innerHeight - height - 16);
    const top = below + height > window.innerHeight - 16
      ? Math.min(maxTop, Math.max(16, rect.top - gap - height))
      : below;
    if (top !== preview.top) setPreview((current) => (current ? { ...current, top } : current));
  }, [preview, dialogRef, anchorRef, setPreview]);
}

function SourcePreviewItem({ source }: { source: TurnSourceItem }) {
  const host = safeHostname(source.url);
  return (
    <div className="turn-source-preview-item">
      <div className="turn-source-preview-header">
        <SourceAvatar url={source.url} host={host} className="turn-source-preview-favicon" />
        <small className="turn-source-preview-host">{host}</small>
      </div>
      <a
        className="turn-source-preview-title"
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {source.title || host}
        <svg
          className="turn-sources-external"
          viewBox="0 0 16 16"
          width="11"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: 'inline-block', marginLeft: 4, verticalAlign: 'middle' }}
        >
          <path d="M12 9v4H3V4h4M9 3h4v4M6.5 9.5 13 3" />
        </svg>
      </a>
      {source.snippet ? (
        <p className="turn-source-preview-snippet">
          <MathText text={source.snippet} />
        </p>
      ) : null}
    </div>
  );
}

function SourcePreviewDialog({
  dialogRef,
  preview,
  sources,
  onMouseEnter,
  onMouseLeave,
}: {
  dialogRef: React.RefObject<HTMLElement | null>;
  preview: PreviewState;
  sources: TurnSourceItem[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return createPortal(
    <aside
      ref={dialogRef}
      className="turn-source-preview"
      role="dialog"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={i18n('citation.preview', 'Source preview')}
      tabIndex={-1}
      style={{ left: preview.left, top: preview.top }}
    >
      {sources.map((source) => (
        <SourcePreviewItem key={source.id} source={source} />
      ))}
    </aside>,
    document.body,
  );
}

/** Links are inserted from validated annotations, never guessed from [n] text. */
export function TurnEvidence({
  runtime,
  text,
  entryId,
  children,
}: {
  runtime?: TurnRuntime | null;
  text: string;
  entryId: string;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const suppressFocus = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelHoverClose = () => clearTimeout(hoverTimer.current);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const sources = runtime?.sources || [];
  const citations = runtime?.citations || [];
  const validClaims = (runtime?.claims || []).filter(
    (entry) =>
      text.slice(entry.start, entry.end) === entry.quote &&
      isCitableTurnRange(text, entry.start, entry.end),
  );
  const citedSources = sources.filter((source) =>
    citations.some(
      (citation) =>
        citation.sourceId === source.id &&
        validClaims.some((entry) => entry.citationIds.includes(citation.id)),
    ),
  );
  const previewSources = resolvePreviewSources(sources, citations, validClaims, preview);

  useSourcePreviewDismiss(preview, dialogRef, anchorRef, suppressFocus, setPreview);
  useSourcePreviewPosition(preview, dialogRef, anchorRef, setPreview);

  const show = (event: SyntheticEvent, pinned = false) => {
    if (suppressFocus.current || !(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>(`a[href^="${PREFIX}"]`);
    if (!anchor) return;
    const claimId = anchor.getAttribute('href')!.slice(PREFIX.length);
    const isDirectSource = claimId.startsWith('source-') && sources.length > 0;
    if (!validClaims.some((entry) => entry.id === claimId) && !isDirectSource) return;
    if (pinned) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!pinned && preview?.pinned) return;
    if (preview?.claimId === claimId && preview.pinned === pinned) return;
    cancelHoverClose();
    anchorRef.current = anchor;
    const rect = anchor.getBoundingClientRect();
    setPreview({
      claimId,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)),
      top: rect.bottom + 8,
      pinned,
    });
  };

  const hoverClose = () => {
    cancelHoverClose();
    if (!preview?.pinned) hoverTimer.current = setTimeout(() => setPreview(null), 240);
  };

  /* Sources only become references through validated annotations. A stored
     runtime whose quote no longer matches the rendered prose (an edited or
     stale message) must not fall back to listing every source: that would
     present metadata the text never cited. A sources-only runtime keeps its
     list because there are no claims to validate. */
  const annotated = citations.length > 0 || (runtime?.claims?.length ?? 0) > 0;
  const visibleSources = citedSources.length ? citedSources : annotated ? [] : sources;

  return (
    <div
      className="turn-evidence"
      onClick={(event) => show(event, true)}
      onMouseOver={show}
      onFocus={show}
      onMouseEnter={cancelHoverClose}
      onMouseLeave={hoverClose}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !dialogRef.current?.contains(event.relatedTarget as Node | null)
        )
          setPreview(null);
      }}
    >
      {children}
      {preview && previewSources.length ? (
        <SourcePreviewDialog
          dialogRef={dialogRef}
          preview={preview}
          sources={previewSources}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={hoverClose}
        />
      ) : null}
      {visibleSources.length ? (
        <TurnSources
          entryId={entryId}
          items={visibleSources.map((source) => ({
            id: source.id,
            title: source.title || safeHostname(source.url),
            url: source.url,
            host: safeHostname(source.url),
            snippet: source.snippet,
          }))}
        />
      ) : null}
    </div>
  );
}
