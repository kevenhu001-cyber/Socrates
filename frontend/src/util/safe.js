// @ts-check
/**
 * Frontend escape + sanitization helpers.
 *
 *  - escapeHtml:     escape every character that could let a string
 *                    break out of a single- or double-quoted HTML
 *                    attribute (used when rawText is interpolated
 *                    into innerHTML by mistake).
 *  - sanitizeUrl:    a single-URL check.  Returns "#" for any URL
 *                    whose scheme is on the deny-list.
 *  - sanitizeUrls:   apply sanitizeUrl to every href / src attribute
 *                    in a chunk of rendered HTML.
 *
 * The deny-list covers `javascript:`, `vbscript:`, and `data:text/html`
 * — the three URL protocols the browser will happily execute when
 * clicked / loaded.  Whitelist-first design so the regex doesn't
 * need to enumerate every future attack vector.
 */
/**
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|blob:|\/|#|\?)/i;
const SAFE_RELATIVE_RE = /^[a-z0-9_.\-\/~?#%@+=&,;:()[\]{}!*'$]+$/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=]+$/i;
const DANGEROUS_URL_RE = /^\s*(?:javascript|vbscript|file|filesystem|data\s*:\s*(?:text\/html|image\/svg|application\/xhtml))/i;

/**
 * @param {unknown} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';
  var trimmed = url.replace(/^[\u0000-\u0020]+/, '');
  if (DANGEROUS_URL_RE.test(trimmed)) return '#';
  if (SAFE_URL_RE.test(trimmed)) return url;
  if (SAFE_DATA_IMAGE_RE.test(trimmed.replace(/\s+/g, ''))) return url;
  /* Relative URLs without a scheme (path, ./, ../, plain filename). */
  if (SAFE_RELATIVE_RE.test(trimmed) && trimmed.indexOf(':') < 0) return url;
  return '#';
}

/**
 * @param {string} html
 * @returns {string}
 */
export function sanitizeUrls(html) {
  if (!html) return html;
  /* href on a, area, link; src on img, iframe, embed, source, track.
     Covers double-quoted, single-quoted, and unquoted values.
     srcset/style() remain DOMPurify's job upstream — this is
     defense-in-depth for the innerHTML paths that bypass it. */
  return html.replace(
    /\b(href|src|xlink:href|action|formaction)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`>]+))/gi,
    /**
     * @param {string} m
     * @param {string} attr
     * @param {string} q
     * @param {string} [double]
     * @param {string} [sglt]
     * @param {string} [bare]
     */
    function (m, attr, q, double, sglt, bare) {
      var url = double !== undefined ? double : sglt !== undefined ? sglt : bare;
      var fixed = sanitizeUrl(url);
      if (fixed === url) return m;
      /* Preserve the original quoting style; bare values get quoted. */
      if (q[0] === '"' || q[0] === "'") return attr + '=' + q[0] + fixed + q[0];
      return attr + '="' + fixed + '"';
    }
  );
}
