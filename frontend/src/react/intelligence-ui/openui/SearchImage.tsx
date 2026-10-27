import { Button as UiButton } from '../../ui/Button';
import { defineComponent } from '@openuidev/react-lang';
import { useState } from 'react';
import { z } from 'zod/v4';
import { useRemoteLabels } from './remoteLabels';
import { localImageUrl, MEDIA_API, useRemote } from './remoteData';
import { radius, radiusSchema, webUrl } from './style';

interface SearchResult { images: { url: string; title: string; sourceUrl: string; author?: string; license?: string }[] }

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
    <div className="iui-search-image-frame" style={{ aspectRatio: Math.min(4, Math.max(.5, aspectRatio)), borderRadius: radius(rounding) }}>
      {image ? <img src={image.url} alt={image.title || term} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ objectFit: fit === 'contain' ? 'contain' : 'cover' }} onError={() => setFailed((previous) => [...previous, image.url])} /> : <div className="iui-media-status" role="status">{result.loading ? labels.imageLoading : labels.imageFailed}
        {!result.loading ? <UiButton type="button" className="iui-button iui-button-outline" onClick={() => { setFailed([]); result.retry(); }}>{labels.retry}</UiButton> : null}
      </div>}
    </div>
    {image ? <figcaption className="iui-search-image-caption">
      <a href={webUrl(image.sourceUrl)!} target="_blank" rel="noopener noreferrer" aria-label={`${labels.imageSource}: ${image.title}`}>{image.title || labels.imageSource}</a>
      {image.author || image.license ? <span>{[image.author, image.license].filter(Boolean).join(' · ')}</span> : null}
      {images.length > 1 ? <span className="iui-image-pager"><UiButton type="button" className="iui-button iui-button-sm" aria-label={labels.previousImage} onClick={() => change(-1)}>‹</UiButton><span>{index + 1} / {images.length}</span><UiButton type="button" className="iui-button iui-button-sm" aria-label={labels.nextImage} onClick={() => change(1)}>›</UiButton></span> : null}
    </figcaption> : null}
  </figure>;
}

export const SearchImage = defineComponent({
  name: 'SearchImage',
  props: z.object({ query: z.string(), aspectRatio: z.number().optional(), radius: radiusSchema.optional(), fit: z.enum(['cover', 'contain']).optional() }),
  description: 'Find real photographs by a precise subject and city. Results are resolved on the server and include source links. Do not invent image URLs.',
  component: function SearchImageView({ props }) { return <SearchPhoto {...props} />; },
});
