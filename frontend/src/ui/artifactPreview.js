import { STROKE_ICONS } from './icons/toolIcons.js';
import { openDetailSurface, closeDetailSurface } from './detailSurface.ts';

let initialized = false;

function translate(key, fallback) {
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

export function openArtifactPreview(options) {
  const opts = options || {};
  const url = String(opts.url || '').trim();
  if (!url) return;
  const mime = String(opts.mimeType || 'application/octet-stream');
  const kind = mime.indexOf('image/') === 0 ? 'image' : mime.indexOf('text/html') === 0 ? 'html' : 'file';
  const previewBody = document.createElement('div');
  previewBody.className = 'artifact-preview-body';
  if (mime.indexOf('image/') === 0) {
    const image = document.createElement('img');
    image.className = 'artifact-preview-image';
    image.src = url;
    image.alt = String(opts.name || translate('artifact.imageAlt', 'Generated image'));
    previewBody.appendChild(image);
  } else if (mime.indexOf('text/html') === 0) {
    const frame = document.createElement('iframe');
    frame.className = 'artifact-preview-frame';
    frame.src = url;
    frame.title = String(opts.name || translate('artifact.htmlAlt', 'Generated HTML preview'));
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
    previewBody.appendChild(frame);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'artifact-preview-fallback';
    fallback.innerHTML = '<span aria-hidden="true">' + STROKE_ICONS.read + '</span>'
      + '<p>' + translate('artifact.noInlinePreview', 'This file opens in a separate tab.') + '</p>';
    const open = document.createElement('a');
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = translate('artifact.openFile', 'Open file');
    fallback.appendChild(open);
    previewBody.appendChild(fallback);
  }

  openDetailSurface({
    owner: 'artifact',
    title: String(opts.name || translate('artifact.title', 'Artifact')),
    meta: kind === 'html' ? translate('artifact.htmlMeta', 'Sandboxed HTML preview')
      : kind === 'image' ? translate('artifact.imageMeta', 'Image preview') : mime,
    closeLabel: translate('artifact.close', 'Close artifact preview'),
    content: previewBody,
  });
}

export function initArtifactPreview() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest
      ? event.target.closest('[data-artifact-preview], .msg.assistant .msg-body img:not(.exec-artifact-image):not(.site-link-favicon)')
      : null;
    if (!target) return;
    event.preventDefault();
    openArtifactPreview({
      url: target.getAttribute('data-artifact-url') || target.getAttribute('src') || target.getAttribute('href'),
      mimeType: target.getAttribute('data-artifact-mime') || (target.tagName === 'IMG' ? 'image/*' : ''),
      name: target.getAttribute('data-artifact-name') || target.getAttribute('alt') || '',
    });
  });
}
