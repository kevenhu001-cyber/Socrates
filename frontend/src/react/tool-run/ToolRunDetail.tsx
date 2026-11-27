import { DetailSection, ImageOutput } from '@socrates/ui/turn';
import { Button } from '../ui/shadcn/button';
import { SourceAvatar } from '../sources/SourceAvatar';
import {
  basename,
  hostOf,
  secondLevelDomainOf,
  translate,
} from '../../legacy/toolPresentationModel.ts';
import { openExternal } from './copyText';
import type { PublicToolDetail } from './publicToolDetail';
import type { DetailSection as Section, SourceItem } from './toolRunModel';

export interface ToolRunDetailProps {
  detail: PublicToolDetail;
}

interface CompactSourceChip {
  key: string;
  url: string;
  domain: string;
}

function compactSearchSources(items: ReadonlyArray<SourceItem>): CompactSourceChip[] {
  const seen = new Set<string>();
  const out: CompactSourceChip[] = [];
  for (const item of items) {
    const raw = item.url || item.host || '';
    const domain = secondLevelDomainOf(raw) || hostOf(raw) || item.host || item.title;
    const dedupeKey = (domain || item.url || item.title).toLowerCase();
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      key: `${dedupeKey}:${item.url}`,
      url: item.url || '',
      domain,
    });
  }
  return out;
}

function ResultSection({ section }: { section: Section }) {
  if (section.kind === 'sources') {
    const chips = compactSearchSources(section.items);
    return (
      <DetailSection title={section.title} kind="sources">
        <div className="tool-source-results is-domain-only" data-testid="tool-sources">
          {chips.map((source) => (
            <Button
              variant="surface"
              size="surface"
              key={source.key}
              type="button"
              className="tool-source-chip"
              data-testid="tool-source"
              role={source.url ? 'link' : undefined}
              disabled={!source.url}
              aria-label={source.domain}
              onClick={() => source.url && openExternal(source.url)}
            >
              <SourceAvatar
                url={source.url}
                host={source.domain}
                className="tool-source-avatar is-favicon"
                testId="tool-source-monogram"
                loadingFallback
              />
              <span className="tool-source-domain is-compact" data-testid="tool-source-host">
                {source.domain}
              </span>
            </Button>
          ))}
        </div>
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
  const { sections: results, images } = detail;
  return (
    <>
      {results.map((section, index) => (
        <ResultSection key={`${section.kind}-${index}`} section={section} />
      ))}
      <ToolImagesSection images={images} />
    </>
  );
}

export default ToolRunDetail;
