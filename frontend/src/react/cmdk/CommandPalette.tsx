import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installCmdKBridge } from './cmdk.bridge';
import {
  useCmdKCommands,
  useCmdKResults,
  useCmdKSnapshot,
  useIsCmdKOpen,
} from './cmdk.bridge';
import type { CmdKDoc, CmdKHit } from './types';

const OVERLAY_ID = 'cmdKOverlay';
const MODAL_ID = 'cmdKModal';
const INPUT_ID = 'cmdKInput';
const RESULTS_ID = 'cmdKResults';

const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="cmd-k-icon" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

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
  const mode = (doc as { mode?: string }).mode;
  return mode === 'chat' ? 'Chat' : 'Tutor';
}

function rowTitle(doc: CmdKDoc | null): string {
  return doc?.title ?? '';
}

function rowSnippet(doc: CmdKDoc | null): string {
  return doc?.snippet ?? '';
}

function rowId(doc: CmdKDoc | null): string {
  return doc?.id ?? '';
}

function escAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The React palette renders the same DOM structure the legacy
 * `renderCmdKResultsHits` produced — same class names, same text content,
 * same inline event wiring translated to React handlers — so existing CSS
 * styles and the `inline-handlers.spec.mjs` audit (which only checks
 * `cmdKOverlay` overlay-level handlers, not result rows) keep working.
 */
function CommandPalette() {
  const snapshot = useCmdKSnapshot();
  const open = useIsCmdKOpen();
  const results = useCmdKResults();
  const commands = useCmdKCommands();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // Mirror the legacy `openCmdK` focus behaviour. setTimeout(0) gives
      // the modal a frame to mount before we steal focus.
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const hasQuery = snapshot.query.trim().length > 0;
  const hitViews = useMemo(() => {
    return results.map((hit, idx): { view: CmdKDocView | null; idx: number } => {
      const doc = docFromHit(hit);
      if (!doc) return { view: null, idx };
      return {
        view: {
          kind: doc.kind,
          meta: metaFor(doc),
          title: rowTitle(doc),
          snippet: rowSnippet(doc),
          id: rowId(doc),
        },
        idx,
      };
    });
  }, [results]);

  if (!open) {
    return (
      <div
        className="cmd-k-modal"
        id={MODAL_ID}
        data-react-cmdk-state="closed"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cmd-k-input-row" />
        <div className="cmd-k-results" id={RESULTS_ID} />
        <div className="cmd-k-foot" />
      </div>
    );
  }

  return (
    <div
      className="cmd-k-modal"
      id={MODAL_ID}
      data-react-cmdk-state="open"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="cmd-k-input-row">
        <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
        <input
          ref={inputRef}
          type="text"
          id={INPUT_ID}
          name="cmdKInput"
          aria-label="Search sessions and messages"
          placeholder="Search sessions and messages…"
          autoComplete="off"
          spellCheck={false}
          defaultValue=""
          key={String(open)}
          onChange={(event) => commands.input(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Escape' ||
              event.key === 'ArrowDown' ||
              event.key === 'ArrowUp' ||
              event.key === 'Enter'
            ) {
              event.preventDefault();
              commands.key(event.key);
            }
          }}
        />
        <kbd className="cmd-k-kbd">Esc</kbd>
      </div>
      <div className="cmd-k-results" id={RESULTS_ID}>
        {!hasQuery && snapshot.recent.length > 0 ? (
          <RecentSection recent={snapshot.recent} onPick={commands.input} />
        ) : !hasQuery ? (
          <div className="cmd-k-empty">Type to search across all your sessions.</div>
        ) : hitViews.length === 0 ? (
          <div className="cmd-k-empty">
            No results. Press <kbd>↵</kbd> to search on the server.
          </div>
        ) : (
          <div className="cmd-k-section">
            <div className="cmd-k-section-label">
              {hitViews.length} result{hitViews.length === 1 ? '' : 's'} for &ldquo;{snapshot.query}&rdquo;
            </div>
            {hitViews.map(({ view, idx }) =>
              view === null ? null : (
                <div
                  key={`${view.kind}:${view.id}:${idx}`}
                  className={
                    'cmd-k-row' + (idx === snapshot.selectedIndex ? ' selected' : '')
                  }
                  data-idx={idx}
                  data-kind={view.kind}
                  data-id={view.id}
                  onClick={() => commands.activate(idx)}
                  onMouseEnter={() => commands.activate(idx)}
                >
                  <div className="cmd-k-row-title">{view.title}</div>
                  <div className="cmd-k-row-snippet">{view.snippet}</div>
                  <div className="cmd-k-row-meta">{view.meta}</div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <div className="cmd-k-foot" />
    </div>
  );
}

interface RecentSectionProps {
  recent: ReadonlyArray<string>;
  onPick: (value: string) => void;
}

function RecentSection({ recent, onPick }: RecentSectionProps) {
  return (
    <div className="cmd-k-section">
      <div className="cmd-k-section-label">Recent</div>
      {recent.slice(0, 5).map((it) => (
        <div
          key={it}
          className="cmd-k-row"
          data-recent={escAttr(it)}
          onClick={() => onPick(it)}
        >
          <div className="cmd-k-row-title">{it}</div>
          <div className="cmd-k-row-meta">Recent</div>
        </div>
      ))}
    </div>
  );
}

export interface CmdKReactRootHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Hydrates the legacy `#cmdKOverlay` element with React. Idempotent — a
 * second call returns the existing handle. The overlay element itself is
 * preserved (same id, same classes, same `onclick` contract for the
 * backdrop-click dismissal) — React owns only `#cmdKModal`'s contents.
 *
 * Callers claim the overlay through the module-private ownership registry,
 * so the legacy renderer becomes a no-op the moment React takes over.
 */
export function hydrateCmdKOverlay(): CmdKReactRootHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  /* A duplicate registry run short-circuits on the ownership marker. */
  if (hostIsMountedBy(overlay, 'cmd-k')) {
    throw new Error('CmdK React runtime was initialized more than once.');
  }

  installCmdKBridge();

  const root = createRoot(overlay);
  root.render(<CommandPalette />);
  markHostMountedBy(overlay, 'cmd-k');
  return {
    overlay,
    root,
    destroy: () => {
      root.unmount();
      clearHostMounted(overlay);
    },
  };
}
