import { Button } from '../ui/Button';
import { useEffect, useId, useRef, useState } from 'react';
import { formatToolOutput } from '../../render/toolOutput.ts';
import { basename, tf, translate } from '../../ui/toolPresentationModel.ts';
import type { DetailSection, TechSection, ToolRunView } from './toolRunModel.js';

export function ResultSection({ section }: { section: DetailSection }) {
  if (section.kind === 'sources') {
    return (
      <section className="tool-inline-detail-section" data-kind="sources">
        <div className="tool-inline-detail-title">{section.title}</div>
        <div className="tool-inline-sources">
          {section.items.map((source, index) => {
            const inner = (
              <>
                <span className="tool-inline-src-title">{source.title}</span>
                {source.host || source.date || source.source ? (
                  <span className="tool-inline-src-meta">
                    {source.host ? <span className="tool-inline-src-host">{source.host}</span> : null}
                    {source.date ? <span className="tool-inline-src-date">{source.date}</span> : null}
                    {source.source ? <span className="tool-inline-src-engine">{source.source}</span> : null}
                  </span>
                ) : null}
              </>
            );
            const key = `${source.url || source.title}-${index}`;
            return source.url ? (
              <a
                className="tool-inline-src"
                key={key}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            ) : (
              <span className="tool-inline-src" key={key}>{inner}</span>
            );
          })}
        </div>
      </section>
    );
  }

  if (section.kind === 'files') {
    return (
      <section className="tool-inline-detail-section" data-kind="files">
        <div className="tool-inline-detail-title">{section.title}</div>
        <pre className="tool-inline-detail-value">{section.paths.map(basename).join('\n')}</pre>
      </section>
    );
  }

  /* Output gets the sanitized rich formatter (fences, JSON pretty-print,
     tracebacks); errors stay plain text so the message reads verbatim. */
  return <ExpandableTextSection section={section} />;
}

/* Long outputs keep their full source for expansion and copy. Rich formatting
   only runs on the truncated preview so large dumps avoid an expensive pass. */
function ExpandableTextSection({ section }: { section: Extract<DetailSection, { kind: 'output' | 'error' }> }) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const contentId = useId();
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyAttempt = useRef(0);
  useEffect(() => {
    setCopyState('idle');
    return () => {
      clearTimeout(feedbackTimer.current);
      copyAttempt.current += 1;
    };
  }, [section.text, section.fullText]);
  const expandable = !!section.fullText && section.fullText !== section.text;
  const shown = expanded && section.fullText ? section.fullText : section.text;
  const rich = section.kind === 'output' && !expanded ? formatToolOutput(shown) : null;

  const copy = async () => {
    const attempt = ++copyAttempt.current;
    clearTimeout(feedbackTimer.current);
    const text = section.fullText || section.text;
    let copied: boolean;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_) {
      if (attempt !== copyAttempt.current) return;
      /* Clipboard can be denied (permissions, insecure context) — fall
         back to a selection copy path. */
      const focused = document.activeElement;
      try {
        const { copyTextWithShadcnTextarea } = await import('../legacy-controls/clipboardTextarea');
        await copyTextWithShadcnTextarea(text);
        copied = true;
      } catch (_) {
        // Clipboard denial is recoverable; report failure and allow another try.
        copied = false;
      } finally {
        if (focused instanceof window.HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
      }
    }
    if (attempt !== copyAttempt.current) return;
    setCopyState(copied ? 'copied' : 'failed');
    feedbackTimer.current = setTimeout(() => setCopyState('idle'), 1500);
  };

  return (
    <section className="tool-inline-detail-section" data-kind={section.kind}>
      <div className="tool-inline-detail-title">{section.title}</div>
      {rich && rich.rich ? (
        <pre
          id={contentId}
          className="tool-inline-detail-value tool-inline-detail-rich"
          dangerouslySetInnerHTML={{ __html: rich.html }}
        />
      ) : (
        <pre id={contentId} className="tool-inline-detail-value">{shown}</pre>
      )}
      <div className="tool-inline-detail-actions">
        {expandable ? (
          <Button type="button" className="tool-inline-action" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((value) => !value)}>
            {expanded
              ? translate('tool.showLess', 'Show less')
              : tf('tool.showAll', 'Show all ({n} chars)', { n: (section.fullText || '').length.toLocaleString() })}
          </Button>
        ) : null}
        <Button type="button" className="tool-inline-action" onClick={copy} aria-live="polite">
          {copyState === 'copied' ? translate('tool.copied', 'Copied')
            : copyState === 'failed' ? translate('tool.copyFailed', 'Copy failed') : translate('tool.copy', 'Copy')}
        </Button>
      </div>
    </section>
  );
}

export function TechSectionBlock({ section }: { section: TechSection }) {
  const retryable = section.kind === 'fact' ? section.retryable : undefined;
  return (
    <section className="tool-inline-detail-section" data-kind="technical" data-retryable={retryable}>
      <div className="tool-inline-detail-title">{section.title}</div>
      <pre className="tool-inline-detail-value">{section.text}</pre>
    </section>
  );
}

export function RetryButton({ view, readOnly }: { view: ToolRunView; readOnly?: boolean }) {
  if (!view.retry || readOnly) return null;
  const retry = view.retry;
  return (
    <div className="tool-inline-error-actions">
      <Button
        type="button"
        className="tool-inline-retry"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          /* Same event the delegated listener in main.js already handles, so
             the retry path needs no new wiring. */
          event.currentTarget.dispatchEvent(
            new CustomEvent('tool-retry', { bubbles: true, detail: retry }),
          );
        }}
      >
        {translate('tool.retry', 'Retry search')}
      </Button>
    </div>
  );
}
