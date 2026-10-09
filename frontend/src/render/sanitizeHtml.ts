/* Shared HTML sanitizer for rendered Markdown and Canvas content. */
import { escHTML } from './helpers.js';
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
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
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
  sanitize: (html: string, config?: unknown) => string;
}

/* Try the shared global and bundled copy. If neither can sanitize, fail
   closed by returning escaped text: sanitizeUrls only rewrites URL
   attributes and is not an HTML/XSS sanitizer. */
export function sanitizeHtml(html: string): string {
  const bundled = bundledDomPurify as unknown as DomPurifyLike;
  const globalPurify = (globalThis as { DOMPurify?: DomPurifyLike }).DOMPurify;
  const candidates = globalPurify === bundled ? [bundled] : [globalPurify, bundled];
  for (const dp of candidates) {
    if (!dp || typeof dp.sanitize !== 'function') continue;
    try {
      return dp.sanitize(html, PURIFY_CONFIG);
    } catch (e) {
      console.warn('[sanitizeHtml] DOMPurify instance failed:', e && (e as Error).message);
    }
  }
  return escHTML(html);
}

