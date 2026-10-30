
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
const EXTERNAL_LINK_SELECTOR = [
  '.msg-body p a[href^="http"]',
  '.msg-body li a[href^="http"]',
  '.msg-body blockquote a[href^="http"]',
  '.tool-inline-src[href^="http"]',
  '.wsr-title[href^="http"]',
  '.link-card-title[href^="http"]',
].join(',');

function parsedUrl(rawUrl: unknown) {
  try {
    const url = new URL(String(rawUrl || ''), browserWindow.location.href);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch (_) {
    return null;
  }
}

/* P_perf-local-favicon — the error fallback used to point at
   https://www.google.com/s2/favicons?domain_url=… . That host is
   unreachable from mainland China, so on a restricted network every
   link whose own /favicon.ico failed (which is most foreign links)
   fired a second request that hung until the browser's own timeout —
   and an <img> that never settles keeps the page's loading indicator
   spinning long after the transcript is readable. Render a monogram
   from the hostname instead: same-origin bytes, no round trip, and it
   still identifies the site. */
function fallbackFavicon(url: URL | null) {
  const host = String((url && url.hostname) || '').replace(/^www\./i, '');
  const letter = /^[a-z0-9]/i.test(host) ? host.charAt(0).toUpperCase() : '?';
  /* Stable hue per host so the same site keeps the same colour. */
  let hue = 7;
  for (let index = 0; index < host.length; index++) {
    hue = (hue * 31 + host.charCodeAt(index)) % 360;
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + '<rect width="64" height="64" rx="14" fill="hsl(' + hue + ',56%,45%)"/>'
    + '<text x="32" y="45" font-family="system-ui,sans-serif" font-size="34"'
    + ' font-weight="600" fill="#ffffff" text-anchor="middle">' + letter + '</text>'
    + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function createLinkFavicon(rawUrl: unknown) {
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
  /* P_perf-local-favicon — a dropped SYN never fires `error`, so the
     origin attempt can hang for minutes behind a network that silently
     discards the packets. Swap to the local monogram after a short
     watchdog; if the real icon lands afterwards the browser still
     paints it, and aborting the dead request frees the connection. */
  let settled = false;
  const watchdog = setTimeout(function () {
    if (!settled) image.src = image.dataset.fallback || '';
  }, 2500);
  const settle = function () { settled = true; clearTimeout(watchdog); };
  image.addEventListener('load', settle);
  image.addEventListener('error', function onError() {
    settle();
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

function decorateLink(link: HTMLElement) {
  if (link.dataset.faviconDecorated === '1') return;
  link.dataset.faviconDecorated = '1';
  const favicon = createLinkFavicon(link.getAttribute('href'));
  if (!favicon) return;
  link.classList.add('has-site-favicon');
  link.insertBefore(favicon, link.firstChild);
}

export function decorateExternalLinks(root?: ParentNode | null) {
  const scope = root || document;
  /* The root itself can be the link (an inserted <a>); querySelectorAll only
     looks at descendants. `matches` still evaluates the full ancestor chain,
     so `.msg-body p a` is honoured for a bare inserted anchor. */
  if (scope !== document && scope instanceof HTMLElement && scope.matches(EXTERNAL_LINK_SELECTOR)) {
    decorateLink(scope);
  }
  const links = scope.querySelectorAll<HTMLElement>(EXTERNAL_LINK_SELECTOR);
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
  let pending = new Set<Element>();
  let fullScan = true;
  const flush = function () {
    queued = false;
    const roots = pending;
    pending = new Set<Element>();
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
    browserWindow.requestAnimationFrame(flush);
  };
  const observer = new MutationObserver(function (records) {
    for (let r = 0; r < records.length; r++) {
      const added = records[r].addedNodes;
      for (let i = 0; i < added.length; i++) {
        const node = added[i];
        if (node instanceof Element) pending.add(node);
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
