import { Button as UiButton } from '../../ui/Button';
import { defineComponent } from '@openuidev/react-lang';
import { useState } from 'react';
import { z } from 'zod/v4';
import { useRemoteLabels } from './remoteLabels';
import { localImageUrl, MEDIA_API, useRemote } from './remoteData';
import { radius, radiusSchema, webUrl } from './style';

interface SearchImageResult {
  url: string;
  title: string;
  sourceUrl: string;
  author?: string;
  license?: string;
}

interface SearchResult { images: SearchImageResult[] }

function SearchImageFrame({
  image,
  term,
  aspectRatio,
  rounding,
  fit,
  loading,
  loadingLabel,
  failedLabel,
  retryLabel,
  onImageError,
  onRetry,
}: {
  image?: SearchImageResult;
  term: string;
  aspectRatio: number;
  rounding: unknown;
  fit: string;
  loading: boolean;
  loadingLabel: string;
  failedLabel: string;
  retryLabel: string;
  onImageError(): void;
  onRetry(): void;
}) {
  return (
    <div className="iui-search-image-frame" style={{ aspectRatio: Math.min(4, Math.max(.5, aspectRatio)), borderRadius: radius(rounding) }}>
      {image ? <img
        src={image.url}
        alt={image.title || term}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ objectFit: fit === 'contain' ? 'contain' : 'cover' }}
        onError={onImageError}
      /> : <div className="iui-media-status" role="status">
        {loading ? loadingLabel : failedLabel}
        {!loading ? <UiButton type="button" className="iui-button iui-button-outline" onClick={onRetry}>{retryLabel}</UiButton> : null}
      </div>}
    </div>
  );
}

function SearchImageCaption({
  image,
  images,
  index,
  labels,
  onPrevious,
  onNext,
}: {
  image?: SearchImageResult;
  images: SearchImageResult[];
  index: number;
  labels: ReturnType<typeof useRemoteLabels>;
  onPrevious(): void;
  onNext(): void;
}) {
  if (!image) return null;
  return (
    <figcaption className="iui-search-image-caption">
      <a href={webUrl(image.sourceUrl)!} target="_blank" rel="noopener noreferrer" aria-label={`${labels.imageSource}: ${image.title}`}>
        {image.title || labels.imageSource}
      </a>
      {image.author || image.license ? <span>{[image.author, image.license].filter(Boolean).join(' · ')}</span> : null}
      {images.length > 1 ? <span className="iui-image-pager">
        <UiButton type="button" className="iui-button iui-button-sm" aria-label={labels.previousImage} onClick={onPrevious}>‹</UiButton>
        <span>{index + 1} / {images.length}</span>
        <UiButton type="button" className="iui-button iui-button-sm" aria-label={labels.nextImage} onClick={onNext}>›</UiButton>
      </span> : null}
    </figcaption>
  );
}

function SearchPhoto({ query, aspectRatio = 1.5, radius: rounding = 'lg', fit = 'cover' }: { query: string; aspectRatio?: number; radius?: unknown; fit?: string }) {
  const labels = useRemoteLabels();
  const term = query.trim().replace(/\s+/g, ' ');
  const path = term.length >= 2 && term.length <= 200 ? `${MEDIA_API}/images?q=${encodeURIComponent(term)}` : null;
  const result = useRemote<SearchResult>(path);
  const [choice, setChoice] = useState({ query: term, index: 0 });
  const [failed, setFailed] = useState<string[]>([]);
  const images = (Array.isArray(result.data?.images) ? result.data.images : []).filter((item) => localImageUrl(item.url) && webUrl(item.sourceUrl) && !failed.includes(item.url)).slice(0, 8);
  const index = choice.query === term ? choice.index % Math.max(1, images.length) : 0;
  const image = images[index];
  const change = (offset: number) => setChoice({ query: term, index: (index + offset + images.length) % images.length });
  return <figure className="iui-search-image">
    <SearchImageFrame
      image={image}
      term={term}
      aspectRatio={aspectRatio}
      rounding={rounding}
      fit={fit}
      loading={result.loading}
      loadingLabel={labels.imageLoading}
      failedLabel={labels.imageFailed}
      retryLabel={labels.retry}
      onImageError={() => setFailed((previous) => [...previous, image!.url])}
      onRetry={() => { setFailed([]); result.retry(); }}
    />
    <SearchImageCaption
      image={image}
      images={images}
      index={index}
      labels={labels}
      onPrevious={() => change(-1)}
      onNext={() => change(1)}
    />
  </figure>;
}

export const SearchImage = defineComponent({
  name: 'SearchImage',
  props: z.object({ query: z.string(), aspectRatio: z.number().optional(), radius: radiusSchema.optional(), fit: z.enum(['cover', 'contain']).optional() }),
  description: 'Find real photographs by a precise subject and city. Results are resolved on the server and include source links. Do not invent image URLs.',
  component: function SearchImageView({ props }) { return <SearchPhoto {...props} />; },
});
