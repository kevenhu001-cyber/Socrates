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

const w = typeof window !== 'undefined' ? window : null;
const inflight = new Map();
const katexReadyListeners = new Set();

function loadScriptOnce(key, url, globalName) {
  if (w && w[globalName]) return Promise.resolve(w[globalName]);
  if (inflight.has(key)) return inflight.get(key);
  const promise = new Promise((resolve, reject) => {
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
    script.onerror = () => reject(new Error('failed to load ' + key));
    document.head.appendChild(script);
  });
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
    inflight.set('fuse', import('fuse.js').then((mod) => {
      const Fuse = mod.default || mod;
      if (w) w.Fuse = Fuse;
      return Fuse;
    }));
  }
  return inflight.get('fuse');
}

export function ensureKatex() {
  if (w && w.katex) return Promise.resolve(w.katex);
  if (!inflight.has('katex')) {
    inflight.set('katex', Promise.all([
      import('katex'),
      typeof document !== 'undefined'
        ? import('katex/dist/katex.min.css')
        : Promise.resolve(),
    ]).then(([mod]) => {
      const katex = mod.default || mod;
      if (w) w.katex = katex;
      const pending = Array.from(katexReadyListeners);
      katexReadyListeners.clear();
      pending.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      return katex;
    }));
  }
  return inflight.get('katex');
}

export function onKatexReady(callback) {
  if (w && w.katex) {
    try { callback(); } catch (_) { /* ignore */ }
    return () => {};
  }
  katexReadyListeners.add(callback);
  return () => { katexReadyListeners.delete(callback); };
}
