/* Sandboxed extension rendering and model-facing repair routing. */
/* Extension content is self-contained: tags and CSP block executable/network
   escape paths, and resource URLs are limited to fragments or inline data.
   External images and CSS imports would be blocked by the iframe CSP anyway,
   so reject them before rendering with a useful repair error. */

/* P_interactive-sim-scripts — `interactive_simulation` would be a
   contradiction if it rejected <script>: an "interactive" template
   that can never run code fails validation on every genuinely
   interactive submission, then burns the retry budget. Inline
   scripts + event handlers are therefore allowed for that template
   — the iframe runs opaque-origin (sandbox="allow-scripts" only),
   CSP connect-src 'none', no popups, so a script cannot reach the
   parent, the network, or cookies. Same containment the fenced
   ```viz blocks already rely on. `svg_illustration` stays
   script-free: it is static art and gains nothing from executing. */
function extensionIsSafe(source, allowScripts) {
  var src = String(source || '');
  var tagBan = allowScripts
    ? /<(?:iframe|object|embed|form)\b/i
    : /<(?:script|iframe|object|embed|form)\b/i;
  if (tagBan.test(src)) return false;
  if (!allowScripts && /\son\w+\s*=/i.test(src)) return false;
  if (/\b(?:fetch|xmlhttprequest|websocket|sendbeacon|eventsource)\b/i.test(src)) return false;
  if (/@import\b/i.test(src)) return false;
  var attrRe = /\b(?:src|href|action|formaction|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  var match;
  while ((match = attrRe.exec(src)) !== null) {
    var value = String(match[1] || match[2] || match[3] || '').trim();
    if (/^(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\/html)/i.test(value)) return false;
    if (!/^(?:#|data:(?:image\/|font\/)|blob:)/i.test(value)) return false;
  }
  var cssUrlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi;
  while ((match = cssUrlRe.exec(src)) !== null) {
    var cssUrl = String(match[1] || match[2] || match[3] || '').trim();
    if (!/^(?:#|data:(?:image\/|font\/)|blob:)/i.test(cssUrl)) return false;
  }
  return true;
}

function standaloneSvgSource(source) {
  var normalized = String(source || '').replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/i, '').trim();
  if (!/^<svg\b/i.test(normalized)) return '';
  if (!/<\/svg>\s*$/i.test(normalized) && !/^<svg\b[^>]*\/>\s*$/i.test(normalized)) return '';
  return normalized;
}

export function renderExtension(spec, cardId, escapeHtml) {
  var source = String(spec.payload.source || '');
  var allowScripts = spec.template === 'interactive_simulation';
  if (!extensionIsSafe(source, allowScripts)) throw new Error('extension_security_check_failed');
  var nonce = 'viz-' + cardId + '-' + Math.random().toString(36).slice(2);
  var csp = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src data:; form-action 'none'; base-uri 'none'";
  /* P_perf-self-host — sandboxed extension iframes use the platform font
     stack instead of blocking on fonts.googleapis.com. */
  var svgSource = spec.template === 'svg_illustration' ? standaloneSvgSource(source) : '';
  if (spec.template === 'svg_illustration' && !svgSource) throw new Error('svg_document_root_invalid');
  var renderSource = svgSource
    ? '<img class="visualization-svg-illustration" alt="' + escapeHtml(spec.accessibilitySummary) + '" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgSource) + '">'
    : source.replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/i, '');
  var fontPreload = '<style>body{font-family:"Noto Sans SC","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;margin:0;padding:0}'
    + (spec.template === 'svg_illustration'
      ? 'html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:transparent}body{display:grid;place-items:center;background:transparent}svg{max-width:100%;max-height:100%}.visualization-svg-illustration{display:block;max-width:100%;max-height:100%;object-fit:contain}'
      : '')
    + '</style>';
  /* P_ext-viz-error — an interactive_simulation script throwing inside
     the sandbox used to be invisible: the iframe stayed silent and the
     card looked permanently empty. Report error/unhandledrejection to
     the parent (nonce-tagged, same handshake as socrates-viz-ready) so
     the card can surface a diagnostic and a repair affordance. */
  var headScript = '<script>(function(){' +
    'function post(m){try{window.parent.postMessage(m,"*")}catch(e){}}' +
    'window.addEventListener("error",function(e){post({type:"socrates-viz-error",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + ',message:String((e&&e.message)||"runtime error").slice(0,300)})});' +
    'window.addEventListener("unhandledrejection",function(e){post({type:"socrates-viz-error",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + ',message:String((e&&e.reason&&(e.reason.message||e.reason))||"unhandled rejection").slice(0,300)})});' +
    'post({type:"socrates-viz-ready",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + '})' +
    '})()<\/script>';
  var documentSource = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + csp + '">' + fontPreload + headScript + renderSource;
  return '<iframe class="visualization-extension" sandbox="allow-scripts" title="' + escapeHtml(spec.title) + '" data-card-id="' + escapeHtml(cardId) + '" data-nonce="' + escapeHtml(nonce) + '" srcdoc="' + escapeHtml(documentSource) + '"></iframe>';
}

/* P_viz-fix-loop — model-facing repair request for a client-side
   render failure. Rides the existing `tool-retry` CustomEvent
   (detail.prompt → verbatim next-turn message). The model already has
   the full spec in context from its own tool call, so the prompt only
   carries template/title + the error. */
function extensionRepairPrompt(spec, errMsg) {
  var msg = 'The render_visualization card "' + String((spec && spec.title) || '').slice(0, 80)
    + '" (template: ' + (spec && spec.template) + ') failed to render in the client: '
    + String(errMsg || 'render error').slice(0, 300)
    + '. Call render_visualization once more with a corrected spec — fix the payload, or switch to a simpler built-in template (chart/graph templates are more reliable than extension templates).';
  /* GeoGebra is the only renderer loaded from a third-party CDN. When
     the CDN itself is unreachable, retrying the same template cannot
     help — tell the model to express the construction with a
     self-hosted template instead. */
  var renderError = String(errMsg || '');
  if (/deployggb/i.test(renderError) || /geogebra[^.]{0,80}cdn[^.]{0,80}(?:unreachable|unavailable|failed|timed out)/i.test(renderError)) {
    msg += ' GeoGebra\'s CDN is unreachable from this client, so math_construction cannot work right now — rebuild the figure with the `geometry` or `function` template instead.';
  } else if (/geogebra/i.test(renderError)) {
    msg += ' The GeoGebra applet failed locally. If the command syntax is valid, retry the applet once; for a simple planar construction, switch to the built-in `geometry` template.';
  }
  return msg;
}

export function dispatchExtensionRepair(card, spec, errMsg) {
  if (!card || typeof card.dispatchEvent !== 'function') return;
  card.dispatchEvent(new CustomEvent('tool-retry', {
    bubbles: true,
    detail: { tool: 'render_visualization', prompt: extensionRepairPrompt(spec, errMsg) },
  }));
}
