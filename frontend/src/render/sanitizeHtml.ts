/* Shared HTML sanitizer for rendered Markdown and Canvas content. */
import { escHTML } from './helpers.ts';
import bundledDomPurify from 'dompurify';

/* ── DOMPurify configuration ──────────────────────────────────────
   Used by both formatMsg and formatMsgProgressive to sanitise the
   rendered HTML before it reaches the DOM. See git history for the
   full rationale — kept identical to the JS source. */
const PURIFY_CONFIG: {
  ADD_TAGS: string[];
  ADD_ATTR: string[];
  ALLOWED_URI_REGEXP: RegExp;
  KEEP_CONTENT: boolean;
  RETURN_DOM_FRAGMENT: boolean;
  RETURN_DOM: boolean;
  FORBID_TAGS: string[];
  FORBID_ATTR: string[];
} = {
  ADD_TAGS: ['theorem', 'proof', 'key-point', 'derivation'],
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  KEEP_CONTENT: true,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form',
                'meta', 'link', 'base', 'frame', 'frameset', 'noframes',
                'noscript', 'html', 'head', 'body'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus',
                'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup',
                'onkeypress', 'onmousedown', 'onmouseup', 'onmousemove',
                'onmouseout', 'onmouseenter', 'onmouseleave', 'oninput',
                'onpointerdown', 'onpointerup', 'onanimationend',
                'onanimationstart', 'ontransitionend'],
};

interface DomPurifyLike {
  sanitize: (html: string, config?: unknown) => string | DocumentFragment;
}

interface SanitizeHtmlOptions {
  chineseProse?: boolean;
  keepContent?: boolean;
}

function purifyConfig(options: SanitizeHtmlOptions) {
  return options.keepContent === false
    ? { ...PURIFY_CONFIG, KEEP_CONTENT: false }
    : PURIFY_CONFIG;
}

/* Rendered answers can carry many images (markdown images, illustration
   cards). Lazy loading and async decoding keep off-screen history from
   competing with the first screen for the network and the main thread;
   neither changes layout or appearance. Runs on sanitizer output only, so the
   two attributes are the sole additions and an author-set value wins. */
function withLazyImages(html: string): string {
  if (html.indexOf('<img') === -1) return html;
  let out = '';
  let from = 0;
  for (let at = html.indexOf('<img', from); at !== -1; at = html.indexOf('<img', from)) {
    const after = at + 4;
    const next = html.charCodeAt(after);
    /* Only a real <img> tag: the next character ends the tag name. */
    if (!(next === 32 || next === 9 || next === 10 || next === 13 || next === 47 || next === 62)) {
      out += html.slice(from, after);
      from = after;
      continue;
    }
    const close = html.indexOf('>', after);
    const tag = html.slice(after, close === -1 ? html.length : close);
    let extra = '';
    if (!/\sloading=/i.test(tag)) extra += ' loading="lazy"';
    if (!/\sdecoding=/i.test(tag)) extra += ' decoding="async"';
    out += html.slice(from, after) + extra;
    from = after;
  }
  return out + html.slice(from);
}

/* Try the shared global and bundled copy. If neither can sanitize, fail
   closed by returning escaped text: sanitizeUrls only rewrites URL
   attributes and is not an HTML/XSS sanitizer. */
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
  const bundled = bundledDomPurify as unknown as DomPurifyLike;
  const globalPurify = (globalThis as { DOMPurify?: DomPurifyLike }).DOMPurify;
  const candidates = globalPurify === bundled ? [bundled] : [globalPurify, bundled];
  const config = purifyConfig(options);
  for (const dp of candidates) {
    if (!dp || typeof dp.sanitize !== 'function') continue;
    try {
      const clean = dp.sanitize(html, config);
      if (typeof clean === 'string') return withLazyImages(clean);
      const host = document.createElement('template');
      host.content.appendChild(clean);
      return withLazyImages(host.innerHTML);
    } catch (e) {
      console.warn('[sanitizeHtml] DOMPurify instance failed:', e && (e as Error).message);
    }
  }
  return escHTML(html);
}

