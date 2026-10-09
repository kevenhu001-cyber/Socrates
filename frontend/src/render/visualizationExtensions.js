/* Sandboxed extension rendering and model-facing repair routing. */
/* P_extension-safety — block only the actually-dangerous patterns:
   - <script>, <iframe>, <object>, <embed>, <form> tags;
   - inline event handlers (onclick, onerror, …);
   - outbound scripts/fetch/websocket;
   - dangerous URL schemes on attributes (javascript:, vbscript:,
     data:text/html). We previously also rejected any href/src
     starting with `https:`, which broke legitimate CDN images and
     external CSS imports inside svg_illustration templates. */

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
  var attrRe = /\b(?:src|href|action|formaction|xlink:href)\s*=\s*["']?\s*([^\s"'>]+)/gi;
  var match;
  while ((match = attrRe.exec(src)) !== null) {
    var value = String(match[1] || '').trim();
    if (/^(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\/html)/i.test(value)) return false;
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
  if (!extensionIsSafe(source, allowScripts)) return '<div class="visualization-fallback">此扩展内容未通过本地安全检查。标题和数据摘要仍可用。</div>';
  var nonce = 'viz-' + cardId + '-' + Math.random().toString(36).slice(2);
  var csp = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src https: data:; form-action 'none'; base-uri 'none'";
  /* P_perf-self-host — sandboxed extension iframes use the platform font
     stack instead of blocking on fonts.googleapis.com. */
  var svgSource = spec.template === 'svg_illustration' ? standaloneSvgSource(source) : '';
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
  if (/geogebra|deployggb/i.test(String(errMsg || ''))) {
    msg += ' GeoGebra\'s CDN is unreachable from this client, so math_construction cannot work right now — rebuild the figure with the `geometry` or `function` template instead.';
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
