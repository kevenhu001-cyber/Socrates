import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Server-side HTML sanitizer backed by DOMPurify + jsdom.
//
// The front-end already sanitizes message HTML in the browser via
// its own DOMPurify pass, but the SPA also stores the *raw* message
// body on the server (rawText). If the front-end ever fails to
// sanitize (CSP issue, extension interference, a hand-rolled
// curl POST against /api/messages/...) the stored text could end
// up being re-rendered into a session view by another browser
// later, escaping our first line of defense.
//
// The default DOMPurify config is permissive enough for our markdown
// output (the renderer emits <a>, <strong>, <em>, <code>, <pre>,
// <ul>, <ol>, <li>, <table>, <blockquote>, <img>, KaTeX <span
// class="katex">, mermaid <svg>, and DOMPurify's recommended
// defaults). We additionally forbid:
//   - <script>, <style>, <iframe>, <object>, <embed>, <form>
//   - on* attributes (onclick, onload, ...)
//   - javascript: / data: URLs in href / src
//   - foreign-markup SVG <script>
const window = new JSDOM('').window;
const purify = createDOMPurify(window);

/* P_extra-body-share — H5 audit fix.
 * Whitelist of extra_body keys that may be forwarded to the LLM
 * upstream. The SPA is allowed to tune reasoning / sampling knobs
 * (top_p, top_k, seed, logit_bias, response_format, ...), but it
 * must never be able to inject `tools`, `api_key`, `messages`, or
 * any other field that would let a forged payload redefine the
 * conversation or smuggle a credential. */
const ALLOWED_EXTRA_BODY_KEYS = new Set([
  'thinking',
  'top_p',
  'top_k',
  'stop',
  'frequency_penalty',
  'presence_penalty',
  'logit_bias',
  'seed',
  'response_format',
]);

/**
 * Filter an `extra_body` object against the upstream-allowlist. Returns
 * `undefined` for any input that is not a non-array object, and for an
 * object that yields no whitelisted keys. Values are restricted to
 * primitive arrays and flat-primitive objects so a malicious caller
 * cannot nest functions / Dates / class instances.
 *
 * @param {unknown} raw
 * @returns {object|undefined}
 */
export function sanitizeExtraBody(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ALLOWED_EXTRA_BODY_KEYS.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
        out[k] = v;
      }
    } else if (v && typeof v === 'object') {
      const allPrim = Object.values(v).every((x) =>
        typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
      );
      if (allPrim) out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/* P_share-visibility-enum — M6 audit fix. Both `shares.visibility`
 * and `artifacts.visibility` are plain TEXT in the schema (no
 * CHECK constraint), so an unvalidated write can store anything
 * (e.g. `public; DROP TABLE shares; --` or the deprecated value
 * `link`). Lock to the three known values and silently fall back
 * to 'unlisted' for anything else so legacy clients that send
 * `link` keep working. */
const ALLOWED_VISIBILITY = new Set(['public', 'unlisted', 'private']);
export function normalizeVisibility(v) {
  if (typeof v === 'string' && ALLOWED_VISIBILITY.has(v)) return v;
  return 'unlisted';
}

/**
 * Sanitize an HTML string for storage. Returns the cleaned HTML;
 * if the input is not a string we coerce to '' to avoid leaking
 * arbitrary JS objects through error paths.
 *
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeStoredHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return '';
  return purify.sanitize(html, {
    // FORBID_TAGS is additive to the default tag list — DOMPurify
    // still keeps the recommended safe tags (<a>, <b>, <i>, ...).
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'meta', 'link', 'base'],
    FORBID_ATTR: ['style', 'srcdoc'],
    // Allow Tutor scaffold tags (theorem, proof, key-point, derivation)
    // so they survive storage and can be re-rendered for shared views.
    ADD_TAGS: ['theorem', 'proof', 'key-point', 'derivation'],
    // Allow data: URLs ONLY on <img>; everything else must be http/https.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,   // drop the tag but keep inner text
    USE_PROFILES: { html: true },
  });
}

/**
 * Lightweight plain-text sanitizer. Strips control characters
 * (except \n \r \t), collapses NULs, and trims surrounding whitespace.
 * Used for rawText fields that are rendered with markdown later.
 */
export function sanitizePlainText(text) {
  if (typeof text !== 'string') return '';
  // Strip C0 control chars except newline / carriage return / tab.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}