import { useState } from 'react';
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

function buildLightboxItems(
  directSrc: string | null,
  searchImages: SearchImageResult[] | null | undefined,
  finalSrc: string | null,
  finalAlt: string,
  caption?: string,
  finalTitle?: string,
  sourceUrl?: string,
) {
  if (directSrc) {
    return [{ src: directSrc, alt: finalAlt, caption, title: finalTitle, sourceUrl }];
  }
  if (searchImages && searchImages.length > 0) {
    return searchImages.map((img) => ({
      src: img.url,
      alt: img.title,
      caption: img.title,
      title: img.title,
      sourceUrl: img.sourceUrl,
    }));
  }
  if (finalSrc) {
    return [{ src: finalSrc, alt: finalAlt, caption, title: finalTitle, sourceUrl }];
  }
  return [];
}

function parseImageNodeProps(node: IntelligentUiNode, context: RenderContext) {
  const directSrc = normalizeIntelligentUiImageUrl(resolve(node.src || node.url, context));
  const query = asProse(resolve(node.query, context));
  const alt = asProse(resolve(node.alt || node.imageAlt, context));
  const caption = asProse(resolve(node.caption, context));
  const title = asProse(resolve(node.title, context));
  const fit = String(node.fit || 'cover').toLowerCase() === 'contain' ? 'contain' : 'cover';
  const aspectRatio = asNumber(resolve(node.aspectRatio, context), 16 / 9);
  return { directSrc, query, alt, caption, title, fit, aspectRatio };
}

function resolveFinalImageFields(
  parsed: ReturnType<typeof parseImageNodeProps>,
  resolvedSearchImage: SearchImageResult | null,
  rawSourceUrl: unknown,
) {
  const finalSrc = parsed.directSrc || resolvedSearchImage?.url || null;
  const finalTitle = parsed.title || resolvedSearchImage?.title || parsed.query;
  const finalAlt = parsed.alt || finalTitle || parsed.caption || 'Image';
  const sourceUrl =
    resolvedSearchImage?.sourceUrl || (typeof rawSourceUrl === 'string' ? rawSourceUrl : undefined);
  return { finalSrc, finalTitle, finalAlt, sourceUrl };
}

function useResolvedImageData(
  node: IntelligentUiNode,
  context: RenderContext,
  activeSearchIndex: number,
) {
  const parsed = parseImageNodeProps(node, context);
  const searchPath =
    !parsed.directSrc && parsed.query
      ? `${MEDIA_API}/images?q=${encodeURIComponent(parsed.query)}`
      : null;
  const { data: searchImages, loading, error, retry } = useRemote<SearchImageResult[]>(searchPath);

  const resolvedSearchImage =
    searchImages && searchImages.length > 0
      ? searchImages[Math.min(activeSearchIndex, searchImages.length - 1)]
      : null;

  const { finalSrc, finalTitle, finalAlt, sourceUrl } = resolveFinalImageFields(
    parsed,
    resolvedSearchImage,
    node.sourceUrl,
  );

  const styleRatio = Math.min(4, Math.max(0.4, parsed.aspectRatio));

  const lightboxItems = buildLightboxItems(
    parsed.directSrc,
    searchImages,
    finalSrc,
    finalAlt,
    parsed.caption,
    finalTitle,
    sourceUrl,
  );

  return {
    title: parsed.title,
    caption: parsed.caption,
    sourceUrl,
    fit: parsed.fit as 'cover' | 'contain',
    styleRatio,
    finalSrc,
    finalAlt,
    loading,
    error,
    retry,
    query: parsed.query,
    searchPath,
    searchImages,
    lightboxItems,
    directSrc: parsed.directSrc,
  };
}

function ImageContent({
  finalSrc,
  finalAlt,
  fit,
  loading,
  query,
  error,
  searchPath,
  onOpen,
  onRetry,
}: {
  finalSrc: string | null;
  finalAlt: string;
  fit: 'cover' | 'contain';
  loading: boolean;
  query: string;
  error: unknown;
  searchPath: string | null;
  onOpen: () => void;
  onRetry: () => void;
}) {
  if (finalSrc) {
    return (
      <div
        className="intui-image-clickable"
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
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
    );
  }
  if (loading) {
    return (
      <div className="intui-image-loading" role="status">
        <span className="thinking-ring thinking-ring-sm" aria-hidden="true" />
        <span className="intui-image-loading-text">
          {query ? `Searching images for "${query}"…` : 'Loading image…'}
        </span>
      </div>
    );
  }
  if (error || searchPath) {
    return (
      <div className="intui-image-error" role="status">
        <span className="intui-image-error-text">
          {query ? `No images found for "${query}"` : 'Image could not be loaded.'}
        </span>
        <BaseButton type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </BaseButton>
      </div>
    );
  }
  return null;
}

function ImageNavStrip({
  currentIndex,
  total,
  onSelectIndex,
}: {
  currentIndex: number;
  total: number;
  onSelectIndex: (index: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="intui-image-nav-strip">
      <BaseButton
        type="button"
        variant="ghost"
        size="sm"
        disabled={currentIndex <= 0}
        onClick={(e) => {
          e.stopPropagation();
          onSelectIndex(Math.max(0, currentIndex - 1));
        }}
        aria-label="Previous image"
      >
        ‹
      </BaseButton>
      <span className="intui-image-nav-count">
        {currentIndex + 1}/{total}
      </span>
      <BaseButton
        type="button"
        variant="ghost"
        size="sm"
        disabled={currentIndex >= total - 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelectIndex(Math.min(total - 1, currentIndex + 1));
        }}
        aria-label="Next image"
      >
        ›
      </BaseButton>
    </div>
  );
}

function ImageCaption({ caption, sourceUrl }: { caption?: string; sourceUrl?: string }) {
  if (!caption && !sourceUrl) return null;
  return (
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
  );
}

export function UiImage({ node, context }: { node: IntelligentUiNode; context: RenderContext }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  const {
    title,
    caption,
    sourceUrl,
    fit,
    styleRatio,
    finalSrc,
    finalAlt,
    loading,
    error,
    retry,
    query,
    searchPath,
    searchImages,
    lightboxItems,
    directSrc,
  } = useResolvedImageData(node, context, activeSearchIndex);

  return (
    <figure className="intui-image" data-intui-id={node.id}>
      {title && (
        <div className="intui-image-title">
          <MathText text={title} />
        </div>
      )}

      <div className="intui-image-container" style={{ aspectRatio: styleRatio }}>
        <ImageContent
          finalSrc={finalSrc}
          finalAlt={finalAlt}
          fit={fit}
          loading={loading}
          query={query}
          error={error}
          searchPath={searchPath}
          onOpen={() => setLightboxOpen(true)}
          onRetry={retry}
        />

        <ImageNavStrip
          currentIndex={activeSearchIndex}
          total={searchImages?.length ?? 0}
          onSelectIndex={setActiveSearchIndex}
        />
      </div>

      <ImageCaption caption={caption} sourceUrl={sourceUrl} />

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
