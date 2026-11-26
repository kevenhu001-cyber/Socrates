import { useId, useState } from 'react';
import {
  CodeBlock,
  Chevron,
  DetailSection,
  ImageOutput,
  PlainDetail,
  sourceCardsOf,
} from '@socrates/ui/turn';
import { UiButton } from '@socrates/ui/primitives';
import { useWindowDimensions } from '../rn/useWindowDimensions';
import { SourceAvatar } from '../sources/SourceAvatar';
import { basename, tf, translate } from '../../legacy/toolPresentationModel.ts';
import { copyText, openExternal } from './copyText';
import { toolOutputsOf } from './toolOutputs';
import { openSourcesPanel } from '../sources/mount';
import type { DetailSection as Section, ToolCallRecord, ToolRunView } from './toolRunModel';

export interface ToolRunDetailProps {
  view: ToolRunView;
  call?: ToolCallRecord;
  /** Share / history-replay surfaces hide the actions that mutate state. */
  readOnly?: boolean;
  inFlight?: boolean;
}

function copyLabels() {
  return {
    copyLabel: translate('tool.copy', 'Copy'),
    copiedLabel: translate('tool.copied', 'Copied'),
    failedLabel: translate('tool.copyFailed', 'Copy failed'),
  };
}

function TextSection({ section }: { section: Extract<Section, { kind: 'output' | 'error' }> }) {
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const expandable = Boolean(section.fullText) && section.fullText !== section.text;
  const shown = expanded && section.fullText ? section.fullText : section.text;
  return (
    <DetailSection title={section.title} kind={section.kind}>
      <CodeBlock
        text={shown}
        tone={section.kind === 'error' ? 'error' : 'plain'}
        onCopy={() => copyText(section.fullText || section.text)}
        {...copyLabels()}
        extra={
          expandable ? (
            <UiButton
              testID="tool-output-expand"
              variant="ghost"
              size={width < 768 ? 'lg' : 'sm'}
              aria-expanded={expanded}
              label={
                expanded
                  ? translate('tool.showLess', 'Show less')
                  : tf('tool.showAll', 'Show all ({n} chars)', {
                      n: (section.fullText || '').length.toLocaleString(),
                    })
              }
              onPress={() => setExpanded((value) => !value)}
            />
          ) : null
        }
      />
    </DetailSection>
  );
}

function ResultSection({ section, entryKey }: { section: Section; entryKey: string }) {
  if (section.kind === 'sources') {
    const items = section.items.map((item, index) => ({
      id: `${entryKey}-${index}`,
      title: item.title || item.url,
      url: item.url,
      host: item.host,
      date: item.date,
      source: item.source,
      snippet: item.snippet,
    }));
    return (
      <DetailSection title={section.title} kind="sources">
        <div className="tool-source-results" data-testid="tool-sources">
          {sourceCardsOf(section.items).map((source, index) => (
            <button
              key={source.key}
              type="button"
              className="tool-source-result"
              data-testid="tool-source"
              role={source.url ? 'link' : undefined}
              disabled={!source.url}
              aria-label={[section.items[index]?.title || source.title, source.host].filter(Boolean).join(' · ')}
              onClick={() => source.url && openExternal(source.url)}
            >
              <SourceAvatar
                url={source.url || ''}
                host={source.host || source.monogram}
                className="tool-source-avatar"
                testId="tool-source-monogram"
              />
              <span className="tool-source-content">
                <span className="tool-source-name" data-testid="tool-source-title">
                  {section.items[index]?.title || source.title}
                </span>
                {source.host ? (
                  <span className="tool-source-domain" data-testid="tool-source-host">
                    {source.host}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <UiButton
          testID="tool-sources-open"
          variant="ghost"
          size="sm"
          label={translate('sources.viewAll', 'View all sources')}
          onPress={() =>
            openSourcesPanel(
              { key: `tool-${entryKey}`, title: section.title, items },
              document.activeElement instanceof HTMLElement ? document.activeElement : null,
            )
          }
        />
      </DetailSection>
    );
  }
  if (section.kind === 'files') {
    return (
      <DetailSection title={section.title} kind="files">
        <ul className="tool-file-list">
          {section.paths.map((path, index) => (
            <li key={`${path}-${index}`} title={path}>
              <span>{basename(path)}</span>
              {path !== basename(path) ? <small>{path}</small> : null}
            </li>
          ))}
        </ul>
      </DetailSection>
    );
  }
  if (section.kind === 'error' && section.title !== 'stderr' && !section.fullText) {
    return (
      <DetailSection title={section.title} kind="error">
        <p className="tool-detail-error-message">{section.text}</p>
      </DetailSection>
    );
  }
  return <TextSection section={section} />;
}

function imageOutputsOf(call: ToolCallRecord | undefined) {
  return toolOutputsOf(call).flatMap((output) =>
    output.kind === 'artifact' && /^image\//i.test(output.mimeType || '')
      ? [
          {
            id: output.id,
            uri: `/api/files/${encodeURIComponent(output.fileId)}/raw`,
            name: output.name || '',
          },
        ]
      : [],
  );
}

interface LiveOutputSectionProps {
  view: ToolRunView;
}

function LiveOutputSection({ view }: LiveOutputSectionProps) {
  return (
    <DetailSection title={translate('tool.detail.liveOutput', 'Live output')} kind="live">
      {view.livePreview ? (
        <CodeBlock
          testID="tool-live-preview"
          maxHeight={280}
          text={view.livePreview}
          {...copyLabels()}
        />
      ) : null}
      {view.liveOutput ? (
        <CodeBlock
          testID="tool-live-output"
          maxHeight={320}
          text={view.liveOutput}
          {...copyLabels()}
        />
      ) : null}
    </DetailSection>
  );
}

function ToolImagesSection({ images }: { images: ReturnType<typeof imageOutputsOf> }) {
  if (!images.length) return null;
  return (
    <DetailSection title={translate('tool.detail.images', 'Images')} kind="images">
      {images.map((image) => (
        <ImageOutput
          key={image.id}
          uri={image.uri}
          alt={image.name || translate('tool.detail.images', 'Images')}
        />
      ))}
    </DetailSection>
  );
}

function ToolArgsCollapsible({ args, width }: { args: Array<{ text: string }>; width: number }) {
  const [showInput, setShowInput] = useState(false);
  const inputId = useId();
  if (!args.length) return null;
  return (
    <div className="thinking-tool-input">
      <UiButton
        testID="tool-input-toggle"
        variant="ghost"
        size={width < 768 ? 'lg' : 'sm'}
        label={translate('tool.detail.input', 'Input')}
        leading={<Chevron open={showInput} />}
        aria-expanded={showInput}
        aria-controls={inputId}
        onPress={() => setShowInput((previous) => !previous)}
      />
      <div id={inputId} hidden={!showInput} data-testid="tool-detail-section-input">
        {showInput
          ? args.map((section, index) => (
              <CodeBlock key={index} text={section.text} onCopy={copyText} {...copyLabels()} />
            ))
          : null}
      </div>
    </div>
  );
}

export function ToolRunDetail({ view, call, inFlight = false }: ToolRunDetailProps) {
  const { width } = useWindowDimensions();
  const args = view.tech.filter((section) => section.kind === 'args');
  const facts = view.tech.filter((section) => section.kind === 'fact');
  const hasLiveOutput = inFlight && Boolean(view.livePreview || view.liveOutput);
  const results = view.sections.filter((section) => section.kind !== 'error');
  const errors = view.sections.filter((section) => section.kind === 'error');
  const images = imageOutputsOf(call);
  const empty =
    !args.length && !hasLiveOutput && !view.sections.length && !images.length && !facts.length;
  const entryKey = call?.id || view.id;
  return (
    <>
      {hasLiveOutput ? <LiveOutputSection view={view} /> : null}
      {results.map((section, index) =>
        !hasLiveOutput || section.kind === 'sources' ? (
          <ResultSection key={`${section.kind}-${index}`} section={section} entryKey={entryKey} />
        ) : null,
      )}
      <ToolImagesSection images={images} />
      {errors.map((section, index) => (
        <ResultSection key={`error-${index}`} section={section} entryKey={entryKey} />
      ))}
      <ToolArgsCollapsible args={args} width={width} />
      {facts.length ? (
        <DetailSection title={translate('tool.techDetails', 'Technical details')} kind="technical">
          {facts.map((section, index) => (
            <PlainDetail
              key={`${section.title}-${index}`}
              text={`${section.title}: ${section.text}`}
            />
          ))}
        </DetailSection>
      ) : null}
      {empty ? <PlainDetail text={translate('tool.noDetails', 'No additional details.')} /> : null}
    </>
  );
}

export default ToolRunDetail;
