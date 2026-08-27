import { STROKE_ICONS } from './icons/toolIcons.js';

let drawer = null;
let backdrop = null;
let previewBody = null;
let previewTitle = null;
let previewMeta = null;
let lastFocus = null;
let initialized = false;

function translate(key, fallback) {
  try {
    const value = typeof window.t === 'function' ? window.t(key) : '';
    return value && value !== key ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function ensurePreview() {
  if (drawer && drawer.isConnected) return drawer;
  backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'artifact-preview-backdrop';
  backdrop.setAttribute('aria-label', translate('artifact.close', 'Close artifact preview'));
  backdrop.addEventListener('click', closeArtifactPreview);

  drawer = document.createElement('aside');
  drawer.className = 'artifact-preview-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'artifactPreviewTitle');
  drawer.innerHTML =
    '<header class="artifact-preview-header">'
    + '<span class="artifact-preview-header-icon" aria-hidden="true">' + STROKE_ICONS.library + '</span>'
    + '<div class="artifact-preview-heading">'
    + '<h2 id="artifactPreviewTitle"></h2>'
    + '<p class="artifact-preview-meta"></p>'
    + '</div>'
    + '<button type="button" class="artifact-preview-close"></button>'
    + '</header>'
    + '<div class="artifact-preview-body"></div>';
  previewTitle = drawer.querySelector('#artifactPreviewTitle');
  previewMeta = drawer.querySelector('.artifact-preview-meta');
  previewBody = drawer.querySelector('.artifact-preview-body');
  const close = drawer.querySelector('.artifact-preview-close');
  close.textContent = translate('common.close', 'Close');
  close.setAttribute('aria-label', translate('artifact.close', 'Close artifact preview'));
  close.addEventListener('click', closeArtifactPreview);
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
  return drawer;
}

export function closeArtifactPreview() {
  if (!drawer) return;
  drawer.classList.remove('is-open');
  if (backdrop) backdrop.classList.remove('is-open');
  document.body.classList.remove('artifact-preview-open');
  window.setTimeout(function () {
    if (previewBody && !drawer.classList.contains('is-open')) previewBody.replaceChildren();
  }, 180);
  try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) { /* ignore */ }
}

export function openArtifactPreview(options) {
  const opts = options || {};
  const url = String(opts.url || '').trim();
  if (!url) return;
  ensurePreview();
  lastFocus = document.activeElement;
  previewTitle.textContent = String(opts.name || translate('artifact.title', 'Artifact'));
  const mime = String(opts.mimeType || 'application/octet-stream');
  const kind = mime.indexOf('image/') === 0 ? 'image' : mime.indexOf('text/html') === 0 ? 'html' : 'file';
  drawer.dataset.artifactType = kind;
  const headerIcon = drawer.querySelector('.artifact-preview-header-icon');
  if (headerIcon) {
    headerIcon.innerHTML = kind === 'image'
      ? STROKE_ICONS.read
      : kind === 'html'
        ? STROKE_ICONS.code
        : STROKE_ICONS.library;
  }
  previewMeta.textContent = kind === 'html'
    ? translate('artifact.htmlMeta', 'Sandboxed HTML preview')
    : kind === 'image'
      ? translate('artifact.imageMeta', 'Image preview')
      : mime;
  previewBody.replaceChildren();

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

  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
  document.body.classList.add('artifact-preview-open');
  window.setTimeout(function () {
    try { drawer.querySelector('.artifact-preview-close').focus(); } catch (_) { /* ignore */ }
  }, 0);
}

export function initArtifactPreview() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && drawer && drawer.classList.contains('is-open')) closeArtifactPreview();
  });
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
