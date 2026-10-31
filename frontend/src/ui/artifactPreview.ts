import { createElement, type ReactNode } from 'react';
import { STROKE_ICONS } from './icons/toolIcons.ts';
import { openDetailSurface, closeDetailSurface } from './detailSurface.ts';

/* Artifact URLs come from API payloads. Only our own origin, or a plain
   https host, may reach an <img src>, an <iframe src> or an <a href>:
   `javascript:` / `data:text/html` there would run in THIS document, and a
   bare http: URL would leak the preview into a cleartext channel. */
function safeArtifactUrl(raw: unknown) {
  const value = String(raw || '').trim();
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value, window.location.origin);
  } catch (_) {
    return '';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  if (parsed.protocol === 'http:' && parsed.origin !== window.location.origin) return '';
  return parsed.href;
}

function translate(key: string, fallback: string) {
  try {
    const value = typeof window.t === 'function' ? window.t(key) : '';
    return value && value !== key ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

export function closeArtifactPreview() {
  closeDetailSurface('artifact');
}

export function openArtifactPreview(options?: { url?: string | null; mimeType?: string; name?: string }) {
  const opts = options || {};
  const url = safeArtifactUrl(opts.url);
  if (!url) return;
  const mime = String(opts.mimeType || 'application/octet-stream');
  const kind = mime.indexOf('image/') === 0 ? 'image' : mime.indexOf('text/html') === 0 ? 'html' : 'file';
  let content: ReactNode;
  if (mime.indexOf('image/') === 0) {
    content = createElement('div', { className: 'artifact-preview-body' }, createElement('img', {
      className: 'artifact-preview-image',
      src: url,
      alt: String(opts.name || translate('artifact.imageAlt', 'Generated image')),
    }));
  } else if (mime.indexOf('text/html') === 0) {
    content = createElement('div', { className: 'artifact-preview-body' }, createElement('iframe', {
      className: 'artifact-preview-frame',
      src: url,
      title: String(opts.name || translate('artifact.htmlAlt', 'Generated HTML preview')),
      sandbox: 'allow-scripts allow-forms allow-modals allow-popups',
    }));
  } else {
    content = createElement('div', { className: 'artifact-preview-body' }, createElement('div', { className: 'artifact-preview-fallback' },
      createElement('span', { 'aria-hidden': true, dangerouslySetInnerHTML: { __html: STROKE_ICONS.read } }),
      createElement('p', null, translate('artifact.noInlinePreview', 'This file opens in a separate tab.')),
      createElement('a', { href: url, target: '_blank', rel: 'noopener' }, translate('artifact.openFile', 'Open file')),
    ));
  }

  openDetailSurface({
    owner: 'artifact',
    title: String(opts.name || translate('artifact.title', 'Artifact')),
    meta: kind === 'html' ? translate('artifact.htmlMeta', 'Sandboxed HTML preview')
      : kind === 'image' ? translate('artifact.imageMeta', 'Image preview') : mime,
    closeLabel: translate('artifact.close', 'Close artifact preview'),
    content,
  });
}
