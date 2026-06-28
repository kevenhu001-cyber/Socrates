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
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_URL_RE = /^(?:https?:|mailto:|tel:|\/|#|\?|[a-z][a-z0-9+.\-]*:)/i;
const DANGEROUS_URL_RE = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)/i;

export function sanitizeUrl(url) {
  if (typeof url !== 'string') return url;
  if (DANGEROUS_URL_RE.test(url)) return '#';
  if (!SAFE_URL_RE.test(url)) return '#';
  return url;
}

export function sanitizeUrls(html) {
  if (!html) return html;
  /* href on a, area, link; src on img, iframe, embed, source, track. */
  return html.replace(
    /\b(href|src|xlink:href|action|formaction)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    function (m, attr, q, double, sglt) {
      var url = double !== undefined ? double : sglt;
      var fixed = sanitizeUrl(url);
      if (fixed === url) return m;
      return attr + '=' + q[0] + fixed + q[0];
    }
  );
}
