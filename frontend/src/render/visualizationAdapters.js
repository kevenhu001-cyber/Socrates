import { whenFontsReady } from './helpers.ts';
import { VIZ_FONT_FAMILY } from './visualizationOptions.ts';
import { ensureMermaid, ensurePlotly } from '../vendor/lazy.js';
import { reportSwallow } from '../util/reportSwallow.ts';

let plotlyPromise;
let mermaidPromise;
let threePromise;
let tldrawPromise;
let geogebraPromise;

const STRUCTURE_TEMPLATES = new Set(['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map']);

export function usesSpecializedRenderer(template) {
  return template === 'function'
    || template === 'paper_chart'
    || template === 'math_construction'
    || template === 'geometry_3d'
    || template === 'whiteboard'
    || STRUCTURE_TEMPLATES.has(template);
}

function cssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `hsl(${value})` : fallback;
}

/* Charts bake theme colours into their SVG at mount time. Without a
   re-theme, a chart drawn in dark mode keeps near-white ticks and dark grid
   lines (Plotly) or dark-filled nodes (Mermaid) after the user switches to
   light, and vice versa. ECharts cards re-theme in visualization.js; this is
   the same hook for the specialised renderers. Returns a disconnect fn. */
function watchTheme(onChange) {
  if (typeof MutationObserver === 'undefined') return;
  let last = document.documentElement.getAttribute('data-mode');
  const observer = new MutationObserver(() => {
    const mode = document.documentElement.getAttribute('data-mode');
    if (mode === last) return;
    last = mode;
    try { onChange(mode); }
    catch (error) { reportSwallow(error, 'visualizationAdapters.themeChange'); }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-theme'] });
  return () => observer.disconnect();
}

function plotlyColors() {
  return {
    text: cssColor('--text-100', '#1c2637'),
    muted: cssColor('--text-300', '#68748a'),
    grid: cssColor('--border-100', '#edf1f5'),
    primary: cssColor('--accent-500', '#3a6df0'),
  };
}

/* Theme-dependent layout keys, flat so the same object feeds newPlot (via
   the nested form below) and Plotly.relayout. The modebar is pinned too:
   left to its default, Plotly derives it from paper_bgcolor 'transparent'
   and paints a 50% black bar with 30% white icons — a dark strip on every
   light chart (always visible on touch devices). */
function plotlyThemeUpdate(colors) {
  return {
    'font.color': colors.text,
    'xaxis.gridcolor': colors.grid,
    'xaxis.zerolinecolor': colors.muted,
    'yaxis.gridcolor': colors.grid,
    'yaxis.zerolinecolor': colors.muted,
    'modebar.bgcolor': 'rgba(0,0,0,0)',
    'modebar.color': colors.muted,
    'modebar.activecolor': colors.text,
  };
}

function geometryForThreeObject(THREE, object) {
  const size = object.size || [1, 1, 1];
  if (object.type === 'sphere') return new THREE.SphereGeometry(size[0] || 1, 40, 24);
  if (object.type === 'cylinder') return new THREE.CylinderGeometry(size[0] || 1, size[0] || 1, size[1] || 2, 36);
  if (object.type === 'cone') return new THREE.ConeGeometry(size[0] || 1, size[1] || 2, 36);
  return new THREE.BoxGeometry(size[0] || 1, size[1] || 1, size[2] || 1);
}

function addThreeObjects(THREE, scene, material, objects) {
  objects.forEach((object) => {
    const mesh = new THREE.Mesh(geometryForThreeObject(THREE, object), material.clone());
    const position = object.position || [0, 0.5, 0];
    mesh.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
    scene.add(mesh);
  });
}

export function plotlyTracesForVisualization(spec, colors, sampleFunctionImpl) {
  if (spec.template === 'function') {
    return (spec.payload.functions || []).map((fn, index) => {
      const sampled = sampleFunctionImpl(fn.expression, fn.domain, 900);
      return {
        x: sampled.points.map((point) => point[0]),
        y: sampled.points.map((point) => point[1]),
        type: 'scatter',
        mode: 'lines',
        name: fn.label || fn.expression,
        line: { width: 2.4, color: [colors.primary, '#16a394', '#8a62d6', '#dc8a2f'][index % 4] },
        connectgaps: false,
      };
    });
  }
  const categories = spec.payload.categories || [];
  return (spec.payload.series || []).map((series, index) => ({
    x: categories.length ? categories : series.data.map((_, i) => i + 1),
    y: series.data,
    type: series.kind === 'bar' ? 'bar' : 'scatter',
    mode: series.kind === 'scatter' ? 'markers' : series.kind === 'bar' ? undefined : 'lines+markers',
    name: series.name || `Series ${index + 1}`,
    line: { width: 2.2 },
  }));
}

function downloadSvgAdapter(stage) {
  return {
    getDataURL() {
      const svg = stage.querySelector('svg');
      if (!svg) return '';
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    },
  };
}

async function mountPlotly(spec, stage, helpers) {
  /* P_perf-self-host — plotly UMD is copied as a static asset and
     injected only when a Plotly card mounts. */
  plotlyPromise ||= ensurePlotly();
  const Plotly = await plotlyPromise;
  const colors = plotlyColors();
  const traces = plotlyTracesForVisualization(spec, colors, helpers.sampleFunction);
  const categories = spec.payload.categories || [];
  const longestCategory = categories.reduce((max, value) => Math.max(max, Array.from(String(value ?? '')).length), 0);
  const tickAngle = categories.length > 10 ? -40 : (categories.length > 6 && longestCategory > 18 ? -28 : 0);
  await whenFontsReady('Geist Sans');
  await Plotly.newPlot(stage, traces, {
    autosize: true,
    margin: { l: 58, r: 22, t: 24, b: tickAngle ? 96 : 58 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: VIZ_FONT_FAMILY, color: colors.text, size: 12 },
    xaxis: { title: { text: spec.payload.xLabel || 'x' }, gridcolor: colors.grid, zerolinecolor: colors.muted, automargin: true, tickangle: tickAngle },
    yaxis: { title: { text: spec.payload.yLabel || 'y' }, gridcolor: colors.grid, zerolinecolor: colors.muted, automargin: true },
    legend: { orientation: 'h', y: 1.08 },
    hovermode: 'closest',
    modebar: { bgcolor: 'rgba(0,0,0,0)', color: colors.muted, activecolor: colors.text },
  }, {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'],
  });
  const stopWatchingTheme = watchTheme(() => {
    Plotly.relayout(stage, plotlyThemeUpdate(plotlyColors()));
  });
  return {
    handled: true,
    chart: {
      dispatchAction() { Plotly.relayout(stage, { 'xaxis.autorange': true, 'yaxis.autorange': true }); },
      getDataURL() { return Plotly.toImage(stage, { format: 'png', width: 1400, height: 820, scale: 1 }); },
    },
    cleanup() { stopWatchingTheme?.(); Plotly.purge(stage); },
  };
}

function compactMermaidLabel(value, max = 48) {
  const chars = Array.from(String(value || '').replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

export function mermaidText(spec) {
  const payload = spec.payload || {};
  const nodes = payload.nodes || [];
  const edges = payload.edges || [];
  const safeId = (value) => `n_${String(value).replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const safeLabel = (value) => compactMermaidLabel(value).replace(/[\r\n"|]/g, ' ');
  if (spec.template === 'sequence') {
    const participants = nodes.map((node) => `participant ${safeId(node.id)} as ${safeLabel(node.label)}`);
    const messages = edges.map((edge) => `${safeId(edge.from)}->>${safeId(edge.to)}: ${safeLabel(edge.label || '')}`);
    return ['sequenceDiagram', ...participants, ...messages].join('\n');
  }
  if (spec.template === 'state') {
    return [
      'stateDiagram-v2',
      ...nodes.map((node) => `state "${safeLabel(node.label)}" as ${safeId(node.id)}`),
      ...edges.map((edge) => `${safeId(edge.from)} --> ${safeId(edge.to)}${edge.label ? ` : ${safeLabel(edge.label)}` : ''}`),
    ].join('\n');
  }
  const direction = payload.direction === 'horizontal' ? 'LR' : 'TB';
  return [
    `flowchart ${direction}`,
    ...nodes.map((node) => `${safeId(node.id)}["${safeLabel(node.label)}"]`),
    ...edges.map((edge) => `${safeId(edge.from)} -->${edge.label ? `|"${safeLabel(edge.label)}"|` : ''} ${safeId(edge.to)}`),
  ].join('\n');
}

export function applyGeoGebraCommands(api, commands) {
  for (const command of commands || []) {
    const accepted = api.evalCommand(command);
    if (accepted === false) throw new Error(`Construction app rejected a command: ${String(command).slice(0, 120)}`);
  }
}

async function mountMermaid(spec, stage) {
  /* P_perf-self-host — mermaid UMD is copied as a static asset and
     injected only when a mermaid card mounts. */
  mermaidPromise ||= ensureMermaid();
  const mermaid = await mermaidPromise;
  const text = mermaidText(spec);
  /* Mermaid bakes the theme into the SVG, so a theme switch re-renders.
     `generation` drops a render that finishes after a newer one started or
     after the card was cleaned up. */
  let generation = 0;
  let disposed = false;
  const draw = async () => {
    const mine = ++generation;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      fontFamily: VIZ_FONT_FAMILY,
      theme: document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'neutral',
      flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: true },
    });
    const id = `socrates-mermaid-${Math.random().toString(36).slice(2)}`;
    const { svg, bindFunctions } = await mermaid.render(id, text);
    if (disposed || mine !== generation) return;
    stage.innerHTML = svg;
    bindFunctions?.(stage);
  };
  await whenFontsReady('Geist Sans');
  await draw();
  const stopWatchingTheme = watchTheme(() => {
    draw().catch((error) => { reportSwallow(error, 'visualizationAdapters.mermaid.themeRender'); });
  });
  return {
    handled: true,
    chart: downloadSvgAdapter(stage),
    cleanup() { disposed = true; stopWatchingTheme?.(); stage.replaceChildren(); },
  };
}

async function mountThree(spec, stage) {
  threePromise ||= Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
  ]);
  const [THREE, controlsModule] = await threePromise;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, Math.max(stage.clientWidth, 1) / Math.max(stage.clientHeight, 1), 0.1, 1000);
  camera.position.set(6, 5, 8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1), false);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  stage.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x273149, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(5, 8, 4); scene.add(key);
  scene.add(new THREE.GridHelper(12, 12, 0x8893a5, 0xdbe2ea));
  const material = new THREE.MeshStandardMaterial({ color: 0x4f78dd, roughness: 0.42, metalness: 0.05, transparent: true, opacity: 0.9 });
  addThreeObjects(THREE, scene, material, spec.payload.objects || []);
  const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  let frame = 0;
  let visible = true;
  const draw = () => {
    frame = 0;
    controls.update();
    renderer.render(scene, camera);
    if (visible) frame = requestAnimationFrame(draw);
  };
  draw();
  /* Only animate while the card is on screen; an offscreen WebGL loop
     keeps the main thread and GPU busy for the whole session. */
  const visibility = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(draw);
    })
    : null;
  visibility?.observe(stage);
  let lastWidth = 0, lastHeight = 0;
  const resize = new ResizeObserver(() => {
    const width = Math.max(stage.clientWidth, 1), height = Math.max(stage.clientHeight, 1);
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width; lastHeight = height;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    if (!frame) renderer.render(scene, camera);
  });
  resize.observe(stage);
  return {
    handled: true,
    chart: {
      dispatchAction() { camera.position.set(6, 5, 8); controls.target.set(0, 0, 0); controls.update(); },
      getDataURL() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    },
    cleanup() { visible = false; cancelAnimationFrame(frame); resize.disconnect(); visibility?.disconnect(); controls.dispose(); renderer.dispose(); scene.clear(); },
  };
}

function loadGeoGebra() {
  if (window.GGBApplet) return Promise.resolve(window.GGBApplet);
  geogebraPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    /* A stalled CDN connection never fires onerror — the card would
       sit in "mounting" forever. Treat silence past the deadline as a
       load failure so the fallback UI (Retry / Fix with AI) shows. */
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error('GeoGebra CDN unreachable (deployggb.js load timed out)'));
    }, 15000);
    const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
    script.src = 'https://www.geogebra.org/apps/deployggb.js';
    script.async = true;
    script.onload = settle(() => {
      if (window.GGBApplet) {
        resolve(window.GGBApplet);
      } else {
        script.remove();
        reject(new Error('GeoGebra loaded without GGBApplet'));
      }
    });
    script.onerror = settle(() => { script.remove(); reject(new Error('GeoGebra CDN unreachable (deployggb.js failed to load)')); });
    document.head.appendChild(script);
  }).catch((error) => {
    /* P_viz-geogebra-retry — a failed CDN load used to poison this cache
       forever (`||=` keeps the rejected promise), so the card's local Retry
       replayed the same rejection instead of re-requesting the script.
       Drop the cache so the next attempt starts a fresh load. */
    geogebraPromise = undefined;
    throw error;
  });
  return geogebraPromise;
}

async function mountGeoGebra(spec, stage) {
  const GGBApplet = await loadGeoGebra();
  let api;
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('GeoGebra applet did not finish loading.')), 20000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const applet = new GGBApplet({
      appName: spec.payload.appName || 'geometry',
      width: Math.max(stage.clientWidth, 320),
      height: Math.max(stage.clientHeight, 300),
      showToolBar: true,
      showAlgebraInput: true,
      showMenuBar: false,
      appletOnLoad(ggbApi) {
        api = ggbApi;
        try {
          applyGeoGebraCommands(ggbApi, spec.payload.commands);
          finish();
        } catch (error) {
          finish(error instanceof Error ? error : new Error('GeoGebra construction command failed.'));
        }
      },
    }, true);
    try { applet.inject(stage); } catch (error) { finish(error instanceof Error ? error : new Error('GeoGebra applet could not be started.')); }
  }).catch((error) => {
    stage.replaceChildren();
    throw error;
  });
  return {
    handled: true,
    chart: { dispatchAction() { api?.setCoordSystem?.(-10, 10, -8, 8); }, getDataURL() { return api?.getPNGBase64 ? `data:image/png;base64,${api.getPNGBase64(1, false, 96)}` : ''; } },
    cleanup() { stage.replaceChildren(); },
  };
}

async function mountWhiteboard(spec, stage) {
  tldrawPromise ||= Promise.all([
    import('react'),
    import('../react/lib/boot/ownedRoot.ts'),
    import('tldraw'),
    import('@tldraw/assets/imports.vite'),
    import('tldraw/tldraw.css'),
  ]).catch((error) => { tldrawPromise = null; throw error; });
  const [React, rootRuntime, tldraw, assets] = await tldrawPromise;
  const seeds = spec.payload.nodes || spec.payload.items || [];
  const onMount = (editor) => {
    const shapes = seeds.slice(0, 30).map((item, index) => ({
      id: tldraw.createShapeId(`seed-${index}`),
      type: 'note',
      x: 40 + (index % 3) * 230,
      y: 40 + Math.floor(index / 3) * 150,
      props: { richText: tldraw.toRichText(item.label || item.detail || `Idea ${index + 1}`), color: ['yellow', 'blue', 'green', 'violet'][index % 4] },
    }));
    if (shapes.length) {
      editor.createShapes(shapes);
      editor.zoomToFit({ animation: { duration: 240 } });
    }
  };
  const root = rootRuntime.mountOwnedRoot(stage, 'whiteboard', React.createElement(tldraw.Tldraw, {
    persistenceKey: `socrates-${String(spec.title || 'whiteboard').replace(/\W+/g, '-').toLowerCase()}`,
    inferDarkMode: true,
    assetUrls: assets.getAssetUrlsByImport(),
    onMount,
  }));
  return { handled: true, chart: null, cleanup() { root.destroy(); } };
}

/**
 * Unified adapter contract — every branch returns
 *   { handled: boolean, chart: { dispatchAction?, getDataURL } | null, cleanup(): void }
 * `cleanup` releases every resource the adapter created (ResizeObserver, RAF,
 * OrbitControls, WebGL context, tldraw root, message listeners) and is invoked
 * through `disposeCard`, which guards against double disposal. The React host
 * only ever calls mount / dispose; it never inspects which library ran.
 */
export async function mountSpecializedVisualization(spec, stage, helpers) {
  if (spec.template === 'function' || spec.template === 'paper_chart') return mountPlotly(spec, stage, helpers);
  if (STRUCTURE_TEMPLATES.has(spec.template)) return mountMermaid(spec, stage);
  if (spec.template === 'geometry_3d') return mountThree(spec, stage);
  if (spec.template === 'math_construction') return mountGeoGebra(spec, stage);
  if (spec.template === 'whiteboard') return mountWhiteboard(spec, stage);
  return { handled: false };
}
