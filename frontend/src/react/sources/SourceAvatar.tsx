import { useState } from 'react';
import { faviconProxyUrl } from '../../legacy/faviconProxy';

/** Shared source avatar: stable dimensions and a host monogram on image failure. */
export function SourceAvatar({
  url,
  host,
  className,
}: {
  url: string;
  host: string;
  className: string;
}) {
  const src = faviconProxyUrl(url);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const monogram = host.replace(/^www\./i, '').charAt(0).toUpperCase() || '?';
  return (
    <span className={className} title={host} aria-hidden="true">
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span>{monogram}</span>
      )}
    </span>
  );
}
