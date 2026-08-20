/* P_perf-self-host — heavy renderers (mermaid / echarts / plotly) are
   committed as verbatim UMD files under src/vendor-files/ and injected
   as classic <script> tags only when a visualization actually mounts.
   `new URL(..., import.meta.url)` makes Vite emit them into dist/assets
   without parsing them, so the build never walks mermaid's diagram
   imports or the 4.8 MB plotly bundle, and Node unit tests can resolve
   the file URL without a bundler. */
const mermaidUrl = new URL('../vendor-files/mermaid.min.js', import.meta.url).href;
const echartsUrl = new URL('../vendor-files/echarts.min.js', import.meta.url).href;
const plotlyUrl = new URL('../vendor-files/plotly.min.js', import.meta.url).href;
const highlightUrl = new URL('../vendor-files/highlight.min.js', import.meta.url).href;
/* P_katex-retry — KaTeX is vendored as a classic UMD script (like mermaid /
   echarts / plotly) instead of a dynamic import. Chrome caches failed
   dynamic-import chunk loads in its module map, so a transient network
   failure used to make EVERY formula render as raw LaTeX for the whole
   page session. Classic <script>/<link> tags have no such cache and are
   retried below. The CSS + fonts are vendored alongside so the relative
   url(fonts/…) references resolve from the same assets directory. */
const katexJsUrl = new URL('../vendor-files/katex/katex.min.js', import.meta.url).href;
const katexCssUrl = new URL('../vendor-files/katex/katex.min.css', import.meta.url).href;

const w = typeof window !== 'undefined' ? window : null;
const inflight = new Map();
const katexReadyListeners = new Set();
let katexCssLoaded = false;
let katexCssAttempts = 0;

function loadScriptOnce(key, url, globalName) {
  if (w && w[globalName]) return Promise.resolve(w[globalName]);
  if (inflight.has(key)) return inflight.get(key);
  const promise = new Promise((resolve, reject) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    const tryLoad = () => {
      attempts += 1;
      if (!w || typeof document === 'undefined') {
        reject(new Error(key + ' loader requires a browser'));
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => {
        const value = w[globalName];
        if (value) {
          resolve(value);
        } else {
          reject(new Error(key + ' loaded but global ' + globalName + ' is missing'));
        }
      };
      script.onerror = () => {
        /* P_lazy-retry — a transient network failure used to reject the
           cached in-flight promise permanently, so every formula / chart
           stayed in its unrendered fallback until a full page refresh.
           Retry a few times with backoff; if the final attempt still
           fails, the cache entry is cleared below so the next ensure*()
           call starts over. */
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(tryLoad, 700 * attempts);
        } else {
          reject(new Error('failed to load ' + key));
        }
      };
      document.head.appendChild(script);
    };
    tryLoad();
  });
  /* A rejected loader must not poison the cache for the rest of the page
     session. Drop the entry so a later call can retry (and, for KaTeX,
     the pending onKatexReady listeners fire once a retry succeeds). */
  promise.catch(() => { if (inflight.get(key) === promise) inflight.delete(key); });
  inflight.set(key, promise);
  return promise;
}

export function ensureMermaid() {
  return loadScriptOnce('mermaid', mermaidUrl, 'mermaid');
}

export function ensureEcharts() {
  return loadScriptOnce('echarts', echartsUrl, 'echarts');
}

export function ensurePlotly() {
  return loadScriptOnce('plotly', plotlyUrl, 'Plotly');
}

export function ensureHighlight() {
  return loadScriptOnce('highlight', highlightUrl, 'hljs');
}

export function ensureFuse() {
  /* fuse.js UMD pollutes window.t (its top-level `var t`), which would
     clobber the app's i18n translator when injected lazily. Its npm ESM
     build is small, so load it as a dynamic module instead. */
  if (w && w.Fuse) return Promise.resolve(w.Fuse);
  if (!inflight.has('fuse')) {
    const promise = import('fuse.js').then((mod) => {
      const Fuse = mod.default || mod;
      if (w) w.Fuse = Fuse;
      return Fuse;
    });
    promise.catch(() => { if (inflight.get('fuse') === promise) inflight.delete('fuse'); });
    inflight.set('fuse', promise);
  }
  return inflight.get('fuse');
}

export function ensureKatex() {
  if (w && w.katex) return Promise.resolve(w.katex);
  if (!inflight.has('katex')) {
    const promise = loadScriptOnce('katex', katexJsUrl, 'katex').then((katex) => {
      ensureKatexCss();
      const pending = Array.from(katexReadyListeners);
      katexReadyListeners.clear();
      pending.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      return katex;
    });
    /* A rejected loader must not poison the cache for the rest of the page
       session. Drop the entry so a later call can retry (and the pending
       onKatexReady listeners fire once a retry succeeds). */
    promise.catch(() => { if (inflight.get('katex') === promise) inflight.delete('katex'); });
    inflight.set('katex', promise);
  }
  return inflight.get('katex');
}

/* Inject the vendored KaTeX stylesheet once. The classic <link> avoids the
   module-map caching that made dynamic CSS imports sticky after a failure;
   a failed stylesheet only degrades styling (formulas still render). */
function ensureKatexCss() {
  if (katexCssLoaded || katexCssAttempts >= 3 || !w || typeof document === 'undefined') return;
  if (document.querySelector('link[data-katex-css]')) {
    katexCssLoaded = true;
    return;
  }
  katexCssAttempts += 1;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = katexCssUrl;
  link.dataset.katexCss = '1';
  link.onerror = () => {
    link.remove();
    katexCssLoaded = false;
    setTimeout(ensureKatexCss, 1000);
  };
  document.head.appendChild(link);
  katexCssLoaded = true;
}

export function onKatexReady(callback) {
  if (w && w.katex) {
    try { callback(); } catch (_) { /* ignore */ }
    return () => {};
  }
  katexReadyListeners.add(callback);
  return () => { katexReadyListeners.delete(callback); };
}
