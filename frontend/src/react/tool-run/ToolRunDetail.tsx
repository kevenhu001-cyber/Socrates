/**
 * react/tool-run/ToolRunDetail.tsx — body of a call's detail drawer / sheet.
 *
 * RN-2: drawn with the shared RN pieces (@socrates/ui/turn). Order is
 * input → live output → results (sources, output, files, images) → error,
 * with error codes and retry hints as a quiet technical footnote.
 */
import { useState } from 'react';
import { CodeBlock, DetailSection, ImageOutput, PlainDetail, SourceList, sourceCardsOf } from '@socrates/ui/turn';
import { UiButton } from '@socrates/ui/primitives';
import { basename, tf, translate } from '../../ui/toolPresentationModel.ts';
import { copyText, openExternal } from './copyText';
import { toolOutputsOf } from './toolOutputs';
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
  const expandable = Boolean(section.fullText) && section.fullText !== section.text;
  const shown = expanded && section.fullText ? section.fullText : section.text;
  return (
    <DetailSection title={section.title} kind={section.kind}>
      <CodeBlock
        text={shown}
        tone={section.kind === 'error' ? 'error' : 'plain'}
        onCopy={() => copyText(section.fullText || section.text)}
        {...copyLabels()}
        extra={expandable ? (
          <UiButton
            testID="tool-output-expand"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            label={expanded
              ? translate('tool.showLess', 'Show less')
              : tf('tool.showAll', 'Show all ({n} chars)', { n: (section.fullText || '').length.toLocaleString() })}
            onPress={() => setExpanded((value) => !value)}
          />
        ) : null}
      />
    </DetailSection>
  );
}

function ResultSection({ section }: { section: Section }) {
  if (section.kind === 'sources') {
    return (
      <DetailSection title={section.title} kind="sources">
        <SourceList sources={sourceCardsOf(section.items)} onOpen={openExternal} />
      </DetailSection>
    );
  }
  if (section.kind === 'files') {
    return (
      <DetailSection title={section.title} kind="files">
        <CodeBlock text={section.paths.map(basename).join('\n')} {...copyLabels()} />
      </DetailSection>
    );
  }
  return <TextSection section={section} />;
}

function imageOutputsOf(call: ToolCallRecord | undefined) {
  return toolOutputsOf(call).flatMap((output) => output.kind === 'artifact' && /^image\//i.test(output.mimeType || '')
    ? [{ id: output.id, uri: `/api/files/${encodeURIComponent(output.fileId)}/raw`, name: output.name || '' }]
    : []);
}

export function ToolRunDetail({ view, call, inFlight = false }: ToolRunDetailProps) {
  const args = view.tech.filter((section) => section.kind === 'args');
  const facts = view.tech.filter((section) => section.kind === 'fact');
  const hasLiveOutput = inFlight && Boolean(view.livePreview || view.liveOutput);
  const results = view.sections.filter((section) => section.kind !== 'error');
  const errors = view.sections.filter((section) => section.kind === 'error');
  const images = imageOutputsOf(call);
  const empty = !args.length && !hasLiveOutput && !view.sections.length && !images.length && !facts.length;
  return (
    <>
      {args.map((section, index) => (
        <DetailSection key={`args-${index}`} title={translate('tool.detail.input', 'Input')} kind="input">
          <CodeBlock text={section.text} onCopy={copyText} {...copyLabels()} />
        </DetailSection>
      ))}
      {hasLiveOutput ? (
        <DetailSection title={translate('tool.detail.liveOutput', 'Live output')} kind="live">
          {view.livePreview ? <CodeBlock testID="tool-live-preview" maxHeight={200} text={view.livePreview} {...copyLabels()} /> : null}
          {view.liveOutput ? <CodeBlock testID="tool-live-output" maxHeight={200} text={view.liveOutput} {...copyLabels()} /> : null}
        </DetailSection>
      ) : null}
      {!hasLiveOutput ? results.map((section, index) => <ResultSection key={`${section.kind}-${index}`} section={section} />) : null}
      {images.length ? (
        <DetailSection title={translate('tool.detail.images', 'Images')} kind="images">
          {images.map((image) => <ImageOutput key={image.id} uri={image.uri} alt={image.name || translate('tool.detail.images', 'Images')} />)}
        </DetailSection>
      ) : null}
      {errors.map((section, index) => <ResultSection key={`error-${index}`} section={section} />)}
      {facts.length ? (
        <DetailSection title={translate('tool.techDetails', 'Technical details')} kind="technical">
          {facts.map((section, index) => (
            <PlainDetail key={`${section.title}-${index}`} text={`${section.title}: ${section.text}`} />
          ))}
        </DetailSection>
      ) : null}
      {empty ? <PlainDetail text={translate('tool.noDetails', 'No additional details.')} /> : null}
    </>
  );
}

export default ToolRunDetail;
