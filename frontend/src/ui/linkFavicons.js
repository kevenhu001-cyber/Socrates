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

function decorateLink(link) {
  if (link.dataset.faviconDecorated === '1') return;
  link.dataset.faviconDecorated = '1';
  const favicon = createLinkFavicon(link.getAttribute('href'));
  if (!favicon) return;
  link.classList.add('has-site-favicon');
  link.insertBefore(favicon, link.firstChild);
}

export function decorateExternalLinks(root) {
  const scope = root && root.querySelectorAll ? root : document;
  /* The root itself can be the link (an inserted <a>); querySelectorAll only
     looks at descendants. `matches` still evaluates the full ancestor chain,
     so `.msg-body p a` is honoured for a bare inserted anchor. */
  if (scope !== document && scope.nodeType === 1 && scope.matches && scope.matches(EXTERNAL_LINK_SELECTOR)) {
    decorateLink(scope);
  }
  const links = scope.querySelectorAll(EXTERNAL_LINK_SELECTOR);
  for (let index = 0; index < links.length; index++) decorateLink(links[index]);
}

/* Past this many inserted roots in one frame a single document scan is
   cheaper than scanning each root. */
const FULL_SCAN_ROOTS = 64;

let initialized = false;

export function initLinkFavicons() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  let queued = false;
  /* P_favicon-incremental — the observer watches the whole document, and the
     flush used to re-run the complex selector over EVERY element on every
     frame that saw any mutation. While an answer streams that is every frame,
     scanning the full transcript (and the sidebar) to find the one or two new
     links. Only the subtrees that were actually inserted can hold undecorated
     links, so scan those. */
  let pending = new Set();
  let fullScan = true;
  const flush = function () {
    queued = false;
    const roots = pending;
    pending = new Set();
    if (fullScan || roots.size > FULL_SCAN_ROOTS) {
      fullScan = false;
      decorateExternalLinks(document);
      return;
    }
    roots.forEach(function (node) {
      if (node.isConnected) decorateExternalLinks(node);
    });
  };
  const queue = function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(flush);
  };
  const observer = new MutationObserver(function (records) {
    for (let r = 0; r < records.length; r++) {
      const added = records[r].addedNodes;
      for (let i = 0; i < added.length; i++) {
        const node = added[i];
        if (node.nodeType === 1) pending.add(node);
        /* A text node landing inside an existing anchor cannot create a new
           link; nothing to scan. */
      }
    }
    if (pending.size || fullScan) queue();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queue, { once: true });
  } else {
    queue();
  }
}
