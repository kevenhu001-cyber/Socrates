const EXTERNAL_LINK_SELECTOR = [
  '.msg-body p a[href^="http"]',
  '.msg-body li a[href^="http"]',
  '.msg-body blockquote a[href^="http"]',
  '.tool-inline-src[href^="http"]',
  '.wsr-title[href^="http"]',
  '.link-card-title[href^="http"]',
].join(',');

function parsedUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''), window.location.href);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch (_) {
    return null;
  }
}

function fallbackFavicon(url) {
  return 'https://www.google.com/s2/favicons?domain_url='
    + encodeURIComponent(url.origin) + '&sz=64';
}

export function createLinkFavicon(rawUrl) {
  const url = parsedUrl(rawUrl);
  if (!url) return null;
  const image = document.createElement('img');
  image.className = 'site-link-favicon';
  image.alt = '';
  image.width = 16;
  image.height = 16;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.src = url.origin + '/favicon.ico';
  image.dataset.fallback = fallbackFavicon(url);
  image.addEventListener('error', function onError() {
    if (image.dataset.fallback) {
      const next = image.dataset.fallback;
      delete image.dataset.fallback;
      image.src = next;
      return;
    }
    image.classList.add('is-unavailable');
  });
  return image;
}

export function decorateExternalLinks(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const links = scope.querySelectorAll(EXTERNAL_LINK_SELECTOR);
  for (let index = 0; index < links.length; index++) {
    const link = links[index];
    if (link.dataset.faviconDecorated === '1') continue;
    link.dataset.faviconDecorated = '1';
    const favicon = createLinkFavicon(link.getAttribute('href'));
    if (!favicon) continue;
    link.classList.add('has-site-favicon');
    link.insertBefore(favicon, link.firstChild);
  }
}

let initialized = false;

export function initLinkFavicons() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  let queued = false;
  const flush = function () {
    queued = false;
    decorateExternalLinks(document);
  };
  const queue = function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(flush);
  };
  const observer = new MutationObserver(queue);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queue, { once: true });
  } else {
    queue();
  }
}
