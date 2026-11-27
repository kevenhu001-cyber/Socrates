import { DetailSection, ImageOutput, sourceCardsOf } from '@socrates/ui/turn';
import { Button } from '../ui/shadcn/button';
import { UiButton } from '@socrates/ui/primitives';
import { SourceAvatar } from '../sources/SourceAvatar';
import { basename, translate } from '../../legacy/toolPresentationModel.ts';
import { openExternal } from './copyText';
import type { PublicToolDetail } from './publicToolDetail';
import { openSourcesPanel } from '../sources/mount';
import type { DetailSection as Section } from './toolRunModel';

export interface ToolRunDetailProps {
  detail: PublicToolDetail;
}

function ResultSection({
  section,
  entryKey,
}: {
  section: Section;
  entryKey: string;
}) {
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
            <Button
              variant="surface"
              size="surface"
              key={source.key}
              type="button"
              className="tool-source-result"
              data-testid="tool-source"
              role={source.url ? 'link' : undefined}
              disabled={!source.url}
              aria-label={[section.items[index]?.title || source.title, source.host]
                .filter(Boolean)
                .join(' · ')}
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
            </Button>
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
  return null;
}

function ToolImagesSection({ images }: { images: PublicToolDetail['images'] }) {
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

/** Only explicitly structured public results may enter the transcript.
 * Raw arguments, stdout/stderr, JSON responses and technical diagnostics are
 * for the tool runtime, not an alternate user-facing answer. */
export function ToolRunDetail({ detail }: ToolRunDetailProps) {
  const { sections: results, images, entryKey } = detail;
  return (
    <>
      {results.map((section, index) => (
        <ResultSection key={`${section.kind}-${index}`} section={section} entryKey={entryKey} />
      ))}
      <ToolImagesSection images={images} />
    </>
  );
}

export default ToolRunDetail;
