import { useEffect, useRef, useState } from 'react';
import { getApiFetch, i18n } from '../legacy/gateway.ts';
import { Button } from '../ui/Button';
import type {
  DocumentPreviewSource,
  PreviewEngine,
  PreviewEngineCallbacks,
  PreviewEngineState,
  PreviewKind,
} from './types.ts';

const PREV_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const NEXT_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const MINUS_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M5 12h14" />
  </svg>
);

const PLUS_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

type PreviewPhase = 'loading' | 'ready' | 'text' | 'error' | 'password';

interface TextPayload {
  text: string;
  truncated: boolean;
}

interface PdfCounter {
  page: number;
  pages: number;
  zoomLabel: string;
}

function PdfToolbar({
  counter,
  engineRef,
}: {
  counter: PdfCounter;
  engineRef: React.RefObject<PreviewEngine | null>;
}) {
  const pageAria =
    i18n('docPreview.pageAriaPrefix', 'Page') + ` ${counter.page} / ${counter.pages}`;
  return (
    <div className="doc-preview-toolbar" role="toolbar" aria-label="PDF">
      <Button
        variant="ghost"
        size="sm"
        className="doc-preview-toolbar-btn"
        aria-label={i18n('docPreview.prevPage', 'Previous page')}
        disabled={counter.page <= 1}
        onClick={() => engineRef.current?.goToPage?.(counter.page - 1)}
      >
        {PREV_ICON}
      </Button>
      <span className="doc-preview-toolbar-page" aria-label={pageAria}>
        {counter.page} / {counter.pages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="doc-preview-toolbar-btn"
        aria-label={i18n('docPreview.nextPage', 'Next page')}
        disabled={counter.page >= counter.pages}
        onClick={() => engineRef.current?.goToPage?.(counter.page + 1)}
      >
        {NEXT_ICON}
      </Button>
      <span className="doc-preview-toolbar-divider" aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        className="doc-preview-toolbar-btn"
        aria-label={i18n('docPreview.zoomOut', 'Zoom out')}
        onClick={() => engineRef.current?.zoomStep?.(-1)}
      >
        {MINUS_ICON}
      </Button>
      <span className="doc-preview-toolbar-zoom">{counter.zoomLabel}</span>
      <Button
        variant="ghost"
        size="sm"
        className="doc-preview-toolbar-btn"
        aria-label={i18n('docPreview.zoomIn', 'Zoom in')}
        onClick={() => engineRef.current?.zoomStep?.(1)}
      >
        {PLUS_ICON}
      </Button>
    </div>
  );
}

function PreviewStatus({ phase, statusText }: { phase: PreviewPhase; statusText: string }) {
  const message =
    phase === 'password'
      ? i18n(
          'docPreview.pdfPassword',
          'This PDF is password-protected, so it cannot be previewed here.',
        )
      : statusText || i18n('docPreview.loadFailed', 'Could not load this file for preview.');
  return (
    <div className="doc-preview-status" role={phase === 'loading' ? 'status' : undefined}>
      {phase === 'loading' ? <span className="file-card-spinner" aria-hidden="true" /> : null}
      <span>{message}</span>
    </div>
  );
}

/** Server-extracted text for the formats no engine renders (.doc/.ppt/.rtf…). */
async function loadServerText(fileId: string): Promise<TextPayload> {
  const request = getApiFetch();
  if (!request) throw new Error('unavailable');
  const result = await request<{
    ok?: boolean;
    error?: string;
    text?: string;
    truncated?: boolean;
  }>('/api/files/' + encodeURIComponent(fileId) + '/content');
  if (!result || result.ok === false) throw new Error(result?.error || 'unavailable');
  return { text: result.text ?? '', truncated: Boolean(result.truncated) };
}

/**
 * The drawer body for a chat attachment: routes to the lazy engine for
 * pdf/docx/pptx/xlsx, to the server text reader for the parsed formats, or
 * to a failure notice that keeps the download action reachable.
 */
export function DocumentPreviewView({
  source,
  kind,
}: {
  source: DocumentPreviewSource;
  kind: PreviewKind;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>('loading');
  const [statusText, setStatusText] = useState('');
  const [text, setText] = useState<TextPayload | null>(null);
  const [counter, setCounter] = useState<PdfCounter>({ page: 1, pages: 0, zoomLabel: '100%' });

  const inlineUrl = '/api/v2/files/' + encodeURIComponent(source.fileId) + '/raw?inline=1';
  const downloadUrl = '/api/v2/files/' + encodeURIComponent(source.fileId) + '/raw';

  useEffect(() => {
    let cancelled = false;
    let handled = false;

    const fail = (message: string) => {
      if (cancelled || handled) return;
      handled = true;
      setStatusText(message);
      setPhase('error');
    };

    const run = async () => {
      if (kind === 'unsupported') {
        fail(
          i18n(
            'docPreview.unsupported',
            'This file type cannot be previewed here. Download the original instead.',
          ),
        );
        return;
      }
      if (!source.fileId) {
        fail(i18n('docPreview.loadFailed', 'Could not load this file for preview.'));
        return;
      }
      if (kind === 'text') {
        try {
          const payload = await loadServerText(source.fileId);
          if (cancelled) return;
          setText(payload);
          setPhase('text');
        } catch {
          fail(i18n('docPreview.loadFailed', 'Could not load this file for preview.'));
        }
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      try {
        const response = await fetch(inlineUrl);
        if (cancelled) return;
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.arrayBuffer();
        if (cancelled) return;
        const callbacks: PreviewEngineCallbacks = {
          onReady: () => {
            if (!cancelled) setPhase('ready');
          },
          onState: (patch: PreviewEngineState) => {
            if (cancelled) return;
            setCounter((previous) => ({
              page: patch.page ?? previous.page,
              pages: patch.pages ?? previous.pages,
              zoomLabel: patch.zoomLabel ?? previous.zoomLabel,
            }));
          },
          onError: (code, message) => {
            handled = true;
            if (cancelled) return;
            setStatusText(message ?? '');
            setPhase(code === 'password' ? 'password' : 'error');
          },
        };
        const { loadEngine } = await import('./engines/loader');
        const engine = await loadEngine(kind, data, container, callbacks);
        if (cancelled) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
      } catch {
        fail(i18n('docPreview.loadFailed', 'Could not load this file for preview.'));
      }
    };

    setPhase('loading');
    setStatusText('');
    setText(null);
    setCounter({ page: 1, pages: 0, zoomLabel: '100%' });
    void run();
    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [source.fileId, kind, inlineUrl]);

  return (
    <div className="doc-preview-body">
      {source.fileId ? (
        <div className="doc-preview-actions">
          <a className="doc-preview-open-original" href={downloadUrl} download={source.name}>
            {i18n('library.download', 'Download original')}
          </a>
        </div>
      ) : null}
      {kind === 'pdf' && phase === 'ready' && counter.pages > 0 ? (
        <PdfToolbar counter={counter} engineRef={engineRef} />
      ) : null}
      {kind === 'text' && text ? (
        <div className="doc-preview-content doc-preview-content--text">
          <pre className="doc-preview-text">{text.text}</pre>
          {text.truncated ? (
            <p className="doc-preview-note">
              {i18n('library.preview.truncated', 'Only the first part of this file is shown.')}
            </p>
          ) : null}
        </div>
      ) : kind === 'text' ? null : (
        <div ref={containerRef} className={'doc-preview-content doc-preview-content--' + kind} />
      )}
      {phase !== 'ready' && phase !== 'text' ? (
        <PreviewStatus phase={phase} statusText={statusText} />
      ) : null}
    </div>
  );
}
