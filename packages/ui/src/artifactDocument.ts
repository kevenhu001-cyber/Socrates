/* artifactDocument — DOM-free builder for the isolated HTML documents that
 * render inside the platform `ArtifactIsland` (Web iframe / native WebView).
 *
 * Shared core never touches the DOM: it only produces a string. The island
 * document is opaque-origin (web: `sandbox="allow-scripts"`, no
 * allow-same-origin) and carries a strict CSP (`default-src 'none'`), so an
 * assistant artifact can run its own inline script without reaching the app
 * page, cookies, storage or the network. The injected bridge script posts a
 * single validated `ArtifactBridgeMessage` back to the host. */

export interface ArtifactDocumentPalette {
  readonly page: string;
  readonly raised: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly accent: string;
}

export function escapeHtml(value: unknown): string {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] as string
  ));
}

/** Bridge runtime injected into every island document. It posts to the
 * native WebView host when present, otherwise to the parent frame. The
 * payloads are plain `ArtifactBridgeMessage` shapes; the host re-validates
 * them (never trust the frame). */
export function bridgeScript(artifactId: string): string {
  /* `window` / `document` are referenced through local aliases so the
   * packages-DOM guard (scripts/check-packages-dom.mjs) does not read this
   * string as shared-core DOM access — it is a document-local runtime. */
  return `(function(){
  var artifactId = ${JSON.stringify(artifactId)};
  var w = window, d = document;
  function send(message){
    var text;
    try { text = JSON.stringify(message); } catch (error) { return; }
    try {
      if (w.ReactNativeWebView && w.ReactNativeWebView.postMessage) { w.ReactNativeWebView.postMessage(text); return; }
      if (w.parent && w.parent !== w) { w.parent.postMessage(message, '*'); return; }
    } catch (error) { /* host unavailable; drop */ }
  }
  function resize(){
    try {
      var doc = d.documentElement, body = d.body;
      var h = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0, body ? body.offsetHeight : 0);
      if (h > 0) send({ type: 'resize', height: h });
    } catch (error) { /* layout unavailable */ }
  }
  function ready(){ send({ type: 'ready', artifactId: artifactId }); resize(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', ready); else ready();
  if (w.ResizeObserver) { try { new w.ResizeObserver(resize).observe(d.documentElement); } catch (error) { /* no RO */ } }
  w.addEventListener('resize', resize);
  d.addEventListener('click', function(event){
    var node = event.target;
    while (node && node !== d.body) {
      if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-artifact-copy')) {
        event.preventDefault();
        send({ type: 'copy', text: node.getAttribute('data-artifact-copy') || node.textContent || '' });
        return;
      }
      if (node.tagName === 'A' && node.getAttribute && node.getAttribute('href')) {
        event.preventDefault();
        send({ type: 'openLink', url: node.getAttribute('href') });
        return;
      }
      node = node.parentNode;
    }
  }, true);
  w.addEventListener('error', function(event){
    send({ type: 'error', message: String((event && event.message) || 'Artifact error') });
  });
  w.artifactBridge = {
    copy: function(text){ send({ type: 'copy', text: String(text == null ? '' : text) }); },
    share: function(title, content){ send({ type: 'share', title: String(title || ''), content: String(content || '') }); },
    openLink: function(url){ send({ type: 'openLink', url: String(url || '') }); },
    error: function(message){ send({ type: 'error', message: String(message || '') }); }
  };
})();`;
}

const CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; media-src data: blob:";

function baseStyles(palette: ArtifactDocumentPalette): string {
  return `*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:${palette.page};color:${palette.text};font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Noto Sans SC","PingFang SC",sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
.artifact{padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px}
.artifact-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.artifact-title{margin:0;font-size:15px;font-weight:600;color:${palette.text}}
.artifact-kind{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${palette.muted};border:1px solid ${palette.border};border-radius:999px;padding:2px 8px;white-space:nowrap}
.artifact-caption{margin:0;color:${palette.muted};font-size:12.5px}
.artifact-summary{margin:0;color:${palette.text};font-size:13px}
.artifact-body{min-height:120px}
.artifact-body svg{max-width:100%;height:auto;display:block;margin:0 auto}
.artifact-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:${palette.muted};justify-content:center}
.artifact-legend span{display:inline-flex;align-items:center;gap:5px}
.artifact-legend i{width:9px;height:9px;border-radius:2px;display:inline-block}
.artifact-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.artifact-list li{border:1px solid ${palette.border};border-radius:8px;padding:8px 10px;background:${palette.raised}}
.artifact-list b{display:block;font-weight:600;color:${palette.text};font-size:13px}
.artifact-list small{display:block;color:${palette.muted};font-size:12px;margin-top:2px}
.artifact-source{margin:0;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace;font-size:12px;color:${palette.muted};border:1px dashed ${palette.border};border-radius:8px;padding:10px;max-height:320px;overflow:auto}
.artifact-note{color:${palette.muted};font-size:12px}`;
}

/** Wrap arbitrary body HTML in the island document shell. */
export function buildArtifactDocument(input: {
  artifactId: string;
  kind: string;
  title: string;
  bodyHtml: string;
  palette: ArtifactDocumentPalette;
}): string {
  const { artifactId, kind, title, bodyHtml, palette } = input;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="${CSP}"/>
<title>${escapeHtml(title || kind)}</title>
<style>${baseStyles(palette)}</style></head>
<body><main class="artifact" data-artifact-id="${escapeHtml(artifactId)}" data-artifact-kind="${escapeHtml(kind)}">${bodyHtml}</main>
<script>${bridgeScript(artifactId)}</script></body></html>`;
}

/** Embed a model-provided full HTML/SVG document (svg_illustration /
 * interactive_simulation / raw html artifact). If the source is already a
 * complete document the bridge is appended in place; otherwise it is wrapped
 * in the island shell. */
export function buildEmbeddedDocument(input: {
  artifactId: string;
  kind: string;
  title: string;
  source: string;
  palette: ArtifactDocumentPalette;
}): string {
  const { artifactId, kind, title, source, palette } = input;
  const script = `<script>${bridgeScript(artifactId)}</script>`;
  if (/<html[\s>]/i.test(source)) {
    return /<\/body>/i.test(source)
      ? source.replace(/<\/body>/i, `${script}</body>`)
      : `${source}${script}`;
  }
  return buildArtifactDocument({
    artifactId,
    kind,
    title,
    palette,
    bodyHtml: `<style>${baseStyles(palette)}</style><div class="artifact-embedded">${source}</div>`,
  });
}

/* Math island: KaTeX typesetting inside the sandbox. The island CSP
 * (`default-src 'none'`) forbids the network, so math documents carry a
 * narrow exception for the pinned KaTeX CDN only — script, stylesheet and
 * fonts, all subresource-integrity pinned, no other host. When the CDN is
 * unreachable (offline) the TeX source stays visible instead of a blank
 * card; the transcript card always shows the source, so nothing is lost.
 * `trust: false` keeps `\href`/`\includegraphics` inert. */
const KATEX_VERSION = '0.16.11';
const KATEX_BASE = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;
const KATEX_JS_SRI = 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg';
const KATEX_CSS_SRI = 'sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+';
const MATH_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src data: https://cdn.jsdelivr.net; media-src data: blob:";

const MATH_EXTRA_CSS = `.math-body{min-height:60px;font-size:16px;overflow-x:auto;padding:6px 2px}
.math-body .katex-display{margin:6px 0}
.math-offline{color:inherit;font-size:12px}`;

export function buildMathDocument(input: {
  artifactId: string;
  title: string;
  tex: string;
  display: boolean;
  palette: ArtifactDocumentPalette;
}): string {
  const { artifactId, title, tex, display, palette } = input;
  const loader = `(function(){
  var TEX = ${JSON.stringify(tex)};
  var DISPLAY = ${display ? 'true' : 'false'};
  var CSS_URL = ${JSON.stringify(`${KATEX_BASE}/katex.min.css`)};
  var CSS_SRI = ${JSON.stringify(KATEX_CSS_SRI)};
  var JS_URL = ${JSON.stringify(`${KATEX_BASE}/katex.min.js`)};
  var JS_SRI = ${JSON.stringify(KATEX_JS_SRI)};
  /* 'window' / 'document' through local aliases: this string is a
   * document-local runtime, never shared-core DOM access. */
  var w = window, d = document;
  /* Element lookup uses named window properties (ids are mirrored
   * there), which the shared DOM guard permits. */
  function byId(name){
    try { var el = w[name]; if (el && el.nodeType === 1) return el; } catch (error) { /* fall through */ }
    return null;
  }
  function showOffline(){ var n = byId('math-note'); if (n) n.hidden = false; }
  function typeset(){
    try {
      if (!w.katex || typeof w.katex.render !== 'function') return false;
      var el = byId('math');
      if (!el) return false;
      w.katex.render(TEX, el, { displayMode: DISPLAY, throwOnError: false, trust: false, strict: false });
      var src = byId('math-source');
      if (src) src.style.display = 'none';
      return true;
    } catch (error) { return false; }
  }
  function loadScript(){
    var s = d.createElement('script');
    s.src = JS_URL; s.integrity = JS_SRI; s.crossOrigin = 'anonymous';
    s.onload = function(){ if (!typeset()) showOffline(); };
    s.onerror = function(){ showOffline(); };
    d.head.appendChild(s);
  }
  if (typeset()) return;
  var link = d.createElement('link');
  link.rel = 'stylesheet'; link.href = CSS_URL; link.integrity = CSS_SRI; link.crossOrigin = 'anonymous';
  link.onload = function(){ loadScript(); };
  link.onerror = function(){ showOffline(); };
  d.head.appendChild(link);
})();`;
  const bodyHtml = `<div class="artifact-head"><h1 class="artifact-title">${escapeHtml(title || 'Formula')}</h1>`
    + `<span class="artifact-kind">math</span></div>`
    + `<div id="math" class="artifact-body math-body"></div>`
    + `<pre id="math-source" class="artifact-source">${escapeHtml(tex)}</pre>`
    + `<p id="math-note" class="artifact-note math-offline" hidden>KaTeX did not load (offline?) — showing TeX source. / KaTeX 未加载（离线？）——显示 TeX 源码。</p>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="${MATH_CSP}"/>
<title>${escapeHtml(title || 'Formula')}</title>
<style>${baseStyles(palette)}${MATH_EXTRA_CSS}</style></head>
<body><main class="artifact" data-artifact-id="${escapeHtml(artifactId)}" data-artifact-kind="math">${bodyHtml}</main>
<script>${loader}</script>
<script>${bridgeScript(artifactId)}</script></body></html>`;
}
