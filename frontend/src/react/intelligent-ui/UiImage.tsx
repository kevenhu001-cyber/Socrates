import { useState, type CSSProperties } from 'react';
import { normalizeIntelligentUiImageUrl, type IntelligentUiNode } from '@socrates/core';
import { MathText } from '../rn/useInlineMath';
import { Button as BaseButton } from '../ui/Button';
import { useRemote, MEDIA_API } from './openui/remoteData';
import { ImageLightbox } from './ImageLightbox';
import { asNumber, asProse, resolve, type RenderContext } from './renderRuntime';

interface SearchImageResult {
  url: string;
  title: string;
  sourceUrl: string;
  author?: string;
  license?: string;
}

export function UiImage({ node, context }: { node: IntelligentUiNode; context: RenderContext }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  const directSrc = normalizeIntelligentUiImageUrl(resolve(node.src || node.url, context));
  const query = asProse(resolve(node.query, context));
  const alt = asProse(resolve(node.alt || node.imageAlt, context));
  const caption = asProse(resolve(node.caption, context));
  const title = asProse(resolve(node.title, context));
  const fit = String(node.fit || 'cover').toLowerCase() === 'contain' ? 'contain' : 'cover';
  const aspectRatio = asNumber(resolve(node.aspectRatio, context), 16 / 9);

  // Dynamic remote search if direct source is missing but query is provided
  const searchPath =
    !directSrc && query ? `${MEDIA_API}/images?q=${encodeURIComponent(query)}` : null;
  const { data: searchImages, loading, error, retry } = useRemote<SearchImageResult[]>(searchPath);

  const resolvedSearchImage =
    searchImages && searchImages.length > 0
      ? searchImages[Math.min(activeSearchIndex, searchImages.length - 1)]
      : null;

  const finalSrc = directSrc || resolvedSearchImage?.url || null;
  const finalTitle = title || resolvedSearchImage?.title || query;
  const finalAlt = alt || finalTitle || caption || 'Image';
  const sourceUrl =
    resolvedSearchImage?.sourceUrl ||
    (typeof node.sourceUrl === 'string' ? node.sourceUrl : undefined);

  const style: CSSProperties = {
    aspectRatio: Math.min(4, Math.max(0.4, aspectRatio)),
    objectFit: fit,
  };

  const lightboxItems = directSrc
    ? [{ src: directSrc, alt: finalAlt, caption, title: finalTitle, sourceUrl }]
    : searchImages && searchImages.length > 0
      ? searchImages.map((img) => ({
          src: img.url,
          alt: img.title,
          caption: img.title,
          title: img.title,
          sourceUrl: img.sourceUrl,
        }))
      : finalSrc
        ? [{ src: finalSrc, alt: finalAlt, caption, title: finalTitle, sourceUrl }]
        : [];

  return (
    <figure className="intui-image" data-intui-id={node.id}>
      {title && (
        <div className="intui-image-title">
          <MathText text={title} />
        </div>
      )}

      <div className="intui-image-container" style={{ aspectRatio: style.aspectRatio }}>
        {finalSrc ? (
          <div
            className="intui-image-clickable"
            onClick={() => setLightboxOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label={`View larger: ${finalAlt}`}
          >
            <img
              src={finalSrc}
              alt={finalAlt}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              style={{ objectFit: fit }}
            />
            <span className="intui-image-zoom-hint" aria-hidden="true">
              🔍
            </span>
          </div>
        ) : loading ? (
          <div className="intui-image-loading" role="status">
            <span className="thinking-ring thinking-ring-sm" aria-hidden="true" />
            <span className="intui-image-loading-text">
              {query ? `Searching images for "${query}"…` : 'Loading image…'}
            </span>
          </div>
        ) : error || (!finalSrc && searchPath) ? (
          <div className="intui-image-error" role="status">
            <span className="intui-image-error-text">
              {query ? `No images found for "${query}"` : 'Image could not be loaded.'}
            </span>
            <BaseButton type="button" variant="outline" size="sm" onClick={retry}>
              Retry
            </BaseButton>
          </div>
        ) : null}

        {searchImages && searchImages.length > 1 && (
          <div className="intui-image-nav-strip">
            <BaseButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={activeSearchIndex <= 0}
              onClick={(e) => {
                e.stopPropagation();
                setActiveSearchIndex((i) => Math.max(0, i - 1));
              }}
              aria-label="Previous image"
            >
              ‹
            </BaseButton>
            <span className="intui-image-nav-count">
              {activeSearchIndex + 1}/{searchImages.length}
            </span>
            <BaseButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={activeSearchIndex >= searchImages.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setActiveSearchIndex((i) => Math.min(searchImages.length - 1, i + 1));
              }}
              aria-label="Next image"
            >
              ›
            </BaseButton>
          </div>
        )}
      </div>

      {(caption || sourceUrl) && (
        <figcaption className="intui-image-caption">
          {caption && <MathText text={caption} />}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="intui-image-source-link"
              title="View source"
            >
              Source ↗
            </a>
          )}
        </figcaption>
      )}

      {lightboxOpen && lightboxItems.length > 0 && (
        <ImageLightbox
          images={lightboxItems}
          initialIndex={directSrc ? 0 : activeSearchIndex}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </figure>
  );
}

export default UiImage;
