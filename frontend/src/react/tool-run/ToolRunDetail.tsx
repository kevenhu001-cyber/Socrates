/**
 * react/tool-run/ToolRunDetail.tsx — the expanded body of a tool row.
 *
 * Two tiers, per the agreed design: `sections` are RESULTS (sources, output,
 * stderr, error text) and appear as soon as the row is expanded; `tech`
 * (argument dump, error code, retryable hint) sits behind a second, collapsed
 * 「技术细节」 toggle, because it is debugging surface rather than something
 * that helps a reader follow the answer.
 *
 * Class names deliberately match the imperative rows' markup
 * (tool-inline-detail-section / -title / -value, tool-inline-src*) so the one
 * stylesheet covers both until Stage 2 removes the old path.
 */
import { formatToolOutput } from '../../render/toolOutput.js';
import { STROKE_ICONS } from '../../ui/icons/toolIcons.js';
import { basename, translate } from './labels.js';
import type { DetailSection, TechSection, ToolRunView } from './toolRunModel';

export interface ToolRunDetailProps {
  view: ToolRunView;
  /** Share / history-replay surfaces hide the actions that mutate state. */
  readOnly?: boolean;
}

function ResultSection({ section }: { section: DetailSection }) {
  if (section.kind === 'sources') {
    return (
      <section className="tool-inline-detail-section" data-kind="sources">
        <div className="tool-inline-detail-title">{section.title}</div>
        <div className="tool-inline-sources">
          {section.items.map((source, index) => {
            const inner = (
              <>
                <span className="tool-inline-src-title">{source.title}</span>
                {source.host ? <span className="tool-inline-src-host">{source.host}</span> : null}
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

  if (section.kind === 'artifacts') {
    return (
      <section className="tool-inline-detail-section" data-kind="artifacts">
        <div className="tool-inline-detail-title">{section.title}</div>
        <div className="tool-inline-artifact-list">
          {section.items.map((artifact) => {
            const url = `/api/files/${encodeURIComponent(artifact.fileId)}/raw`;
            return (
              <div className="tool-inline-artifact-row" key={artifact.id}>
                <span className="tool-inline-artifact-copy">
                  <span className="tool-inline-artifact-name">
                    {artifact.name || artifact.fileId}
                  </span>
                  <span className="tool-inline-artifact-type">
                    {artifact.mimeType || translate('tool.file', 'File')}
                  </span>
                </span>
                <span className="tool-inline-artifact-actions">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {translate('tool.openFile', 'Open')}
                  </a>
                  <a href={url} download>
                    {translate('tool.downloadFile', 'Download')}
                  </a>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  /* Output gets the sanitized rich formatter (fences, JSON pretty-print,
     tracebacks); errors stay plain text so the message reads verbatim. */
  const rich = section.kind === 'output' ? formatToolOutput(section.text) : null;
  return (
    <section className="tool-inline-detail-section" data-kind={section.kind}>
      <div className="tool-inline-detail-title">{section.title}</div>
      {rich && rich.rich ? (
        <pre
          className="tool-inline-detail-value tool-inline-detail-rich"
          dangerouslySetInnerHTML={{ __html: rich.html }}
        />
      ) : (
        <pre className="tool-inline-detail-value">{section.text}</pre>
      )}
    </section>
  );
}

function TechSectionBlock({ section }: { section: TechSection }) {
  const retryable = section.kind === 'fact' ? section.retryable : undefined;
  return (
    <section className="tool-inline-detail-section" data-kind="technical" data-retryable={retryable}>
      <div className="tool-inline-detail-title">{section.title}</div>
      <pre className="tool-inline-detail-value">{section.text}</pre>
    </section>
  );
}

function RetryButton({ view, readOnly }: { view: ToolRunView; readOnly?: boolean }) {
  if (!view.retry || readOnly) return null;
  const retry = view.retry;
  return (
    <div className="tool-inline-error-actions">
      <button
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
      </button>
    </div>
  );
}

export function ToolRunDetail({ view, readOnly }: ToolRunDetailProps) {
  const hasResults = view.sections.length > 0;
  return (
    <div className="tool-inline-detail">
      {view.sections.map((section, index) => (
        <ResultSection key={`${section.kind}-${index}`} section={section} />
      ))}
      {!hasResults && !view.tech.length ? (
        <section className="tool-inline-detail-section">
          <div className="tool-inline-detail-empty">{translate('tool.noDetails', 'No additional details.')}</div>
        </section>
      ) : null}
      <RetryButton view={view} readOnly={readOnly} />
      {view.tech.length ? (
        <details className="tool-inline-tech">
          <summary className="tool-inline-tech-summary">
            <span
              className="tool-inline-tech-icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }}
            />
            {translate('tool.techDetails', 'Technical details')}
          </summary>
          {view.tech.map((section, index) => (
            <TechSectionBlock key={`${section.title}-${index}`} section={section} />
          ))}
        </details>
      ) : null}
    </div>
  );
}

export default ToolRunDetail;
