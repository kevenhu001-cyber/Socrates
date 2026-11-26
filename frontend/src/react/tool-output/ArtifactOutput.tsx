/**
 * react/tool-output/ArtifactOutput.tsx — a saved file's inline preview.
 *
 * React owns the artifact markup and its retry state. HTML files stay inside a
 * sandboxed iframe; other files are exposed as same-origin download links.
 * Generated images remain hidden here so the assistant must reference them
 * explicitly in prose.
 */
import { useEffect, useState } from 'react';

import { openArtifactPreview } from '../../legacy/artifactPreview.ts';
import { nativeIslandFrameAttributes } from '../../ui/nativeIslandFrame';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { i18n } from '../../ui/legacyI18n.ts';
import { ArtifactControl } from '../toolArtifacts/ArtifactControl';
import type { ArtifactOutput as ArtifactOutputData } from '../tool-run/toolRunModel';

export interface ArtifactOutputProps {
  output: ArtifactOutputData;
}

function artifactUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}/raw`;
}

function artifactName(fileId: string): string {
  return fileId.split('-')[0] || fileId;
}

const ArtifactErrorIcon = (
  <svg
    className="artifact-error-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

function useArtifactAvailability(url: string, skipCheck: boolean) {
  const [failure, setFailure] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (skipCheck) {
      setFailure(null);
      return undefined;
    }

    const controller = new AbortController();
    try {
      void fetch(url, {
        method: 'HEAD',
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then((response) => {
          if (!controller.signal.aborted) {
            setFailure(response.ok ? null : `HTTP ${response.status}`);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            reportSwallow(error, 'react/tool-output/ArtifactOutput.probeDownload', 'expected');
          }
        });
    } catch (error) {
      reportSwallow(error, 'react/tool-output/ArtifactOutput.probeDownload', 'expected');
    }

    return () => controller.abort();
  }, [retryVersion, skipCheck, url]);

  return {
    failure,
    retry: () => setRetryVersion((version) => version + 1),
  };
}

function ArtifactErrorView({
  output,
  url,
  onRetry,
}: {
  output: ArtifactOutputData;
  url: string;
  onRetry: () => void;
}) {
  return (
    <div className="artifact-error" data-artifact-id={output.fileId} role="status">
      {ArtifactErrorIcon}
      <span className="artifact-error-text">
        {i18n('artifact.loadFailed', 'This file is temporarily unavailable.')}
      </span>
      <a className="artifact-error-open" href={url} target="_blank" rel="noopener" download>
        {i18n('artifact.openFile', 'Open file')}
      </a>
      <span className="artifact-error-retry-host">
        <ArtifactControl
          kind="retry"
          className="artifact-error-retry"
          label={i18n('artifact.retry', 'Retry')}
          onClick={onRetry}
        />
      </span>
    </div>
  );
}

export function ArtifactOutput({ output }: ArtifactOutputProps) {
  const mimeType = output.mimeType || 'application/octet-stream';
  const url = artifactUrl(output.fileId);
  const isHtml = mimeType.toLowerCase().startsWith('text/html');
  const isImage = /^image\//i.test(mimeType);
  const displayName = output.name?.trim() || artifactName(output.fileId);
  const { failure, retry } = useArtifactAvailability(url, isHtml || isImage);

  if (isImage) return null;

  if (isHtml) {
    return (
      <figure className="exec-artifact exec-artifact-html" data-artifact-id={output.fileId}>
        <iframe
          className="exec-artifact-html-frame"
          {...nativeIslandFrameAttributes({
            kind: 'artifact',
            url,
            title: output.name || i18n('artifact.htmlAlt', 'Generated HTML preview'),
          })}
          loading="lazy"
        />
        <figcaption className="exec-artifact-meta">
          <span className="exec-artifact-meta-name">{displayName}</span>
          <ArtifactControl
            kind="open"
            className="exec-artifact-open"
            label={i18n('artifact.openPreview', 'Open in Artifacts')}
            onClick={() => openArtifactPreview({ url, mimeType, name: displayName })}
          />
        </figcaption>
      </figure>
    );
  }

  if (failure) {
    return <ArtifactErrorView output={output} url={url} onRetry={retry} />;
  }

  const downloadText = i18n('common.downloadFile', '[download {type}]').replace(
    '{type}',
    mimeType || 'file',
  );
  return (
    <a
      className="exec-artifact-link"
      data-artifact-id={output.fileId}
      href={url}
      target="_blank"
      rel="noopener"
      download
    >
      <span className="exec-artifact-file-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6" />
        </svg>
      </span>
      <span className="exec-artifact-file-name">{output.name?.trim() || downloadText}</span>
      <svg className="exec-artifact-download-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" />
      </svg>
    </a>
  );
}

export default ArtifactOutput;
