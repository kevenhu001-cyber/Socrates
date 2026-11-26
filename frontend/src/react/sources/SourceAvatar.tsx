import { useState } from 'react';
import { faviconProxyUrl } from '../../legacy/faviconProxy';

/** Shared source avatar: stable dimensions and a host monogram on image failure. */
export function SourceAvatar({
  url,
  host,
  className,
  imageClassName,
  testId,
  loadingFallback = false,
}: {
  url: string;
  host: string;
  className: string;
  imageClassName?: string;
  testId?: string;
  loadingFallback?: boolean;
}) {
  const src = faviconProxyUrl(url);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const monogram = host.replace(/^www\./i, '').charAt(0).toUpperCase() || '?';
  return (
    <span className={className} title={host} aria-hidden="true" data-testid={testId}>
      {src && failedSrc !== src && loadingFallback && loadedSrc !== src ? (
        <span>{monogram}</span>
      ) : null}
      {src && failedSrc !== src ? (
        <img
          className={imageClassName}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span>{monogram}</span>
      )}
    </span>
  );
}
