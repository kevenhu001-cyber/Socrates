import { useEffect, useRef, useState } from 'react';
import { copyText } from '../../ui/toolCardHelpers.ts';
import type { NormalizedSearchResult } from '../../ui/toolSearchResultsModel.ts';
import { i18n } from '../legacy/gateway';
import { Button } from '../ui/shadcn/button';

function interpolate(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : whole);
}

function sourceCitation(source: NormalizedSearchResult, index: number): string {
  return `[${index + 1}] ${source.title}${source.url && source.url !== '#' ? ` - ${source.url}` : ''}`;
}

function CopyAction({ className, label, text }: { className: string; label: string; text: string }) {
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await copyText(text);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 1200);
  }

  const visibleLabel = feedback === 'copied'
    ? i18n('tool.copied', 'Copied')
    : feedback === 'failed' ? i18n('tool.copyFailed', 'Copy failed') : label;
  return <Button type="button" variant="surface" className={className} onClick={() => { void copy(); }}>{visibleLabel}</Button>;
}

function excerptFor(source: NormalizedSearchResult): string {
  const content = source.snippet;
  if (content.length <= 220) return content;
  return `${content.slice(0, 217)}…`;
}

export function WebSearchResults({ sources, query }: { sources: NormalizedSearchResult[]; query: string }) {
  return (
    <div className="web-search-results">
      {query && (
        <div className="wsr-header">
          <span className="wsr-summary">
            {interpolate(i18n(sources.length === 1 ? 'tool.sourceForQuery' : 'tool.sourcesForQuery',
              sources.length === 1 ? '{n} source for "{query}"' : '{n} sources for "{query}"'), { n: sources.length, query })}
          </span>
          <CopyAction className="wsr-copy-all" label={i18n('tool.copySources', 'Copy sources')} text={sources.map(sourceCitation).join('\n')} />
        </div>
      )}
      {sources.map((source, index) => {
        const title = source.url && source.url !== '#' ? (
          <a className="wsr-title" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
        ) : (
          <a className="wsr-title is-disabled" href="#" aria-disabled="true" tabIndex={-1}>{source.title}</a>
        );
        return (
          <article className={`wsr-item${source.host ? '' : ' wsr-item-muted'}`} key={`${source.url || '#'}-${source.title.toLowerCase()}`}>
            <span className="wsr-index" title={source.host || i18n('tool.unavailableSource', 'Unavailable source')}>[{index + 1}]</span>
            <div className="wsr-body">
              {title}
              <div className="wsr-meta">
                <span className="wsr-host">{source.host || i18n('tool.linkUnavailable', 'Link unavailable')}</span>
                {source.source && <span className="wsr-source">{source.source}</span>}
                {source.date && <span className="wsr-date">{source.date}</span>}
              </div>
              {excerptFor(source) && <p className="wsr-snippet">{excerptFor(source)}</p>}
              <div className="wsr-actions">
                <CopyAction className="wsr-copy" label={i18n('tool.copyCitation', 'Copy citation')} text={sourceCitation(source, index)} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
