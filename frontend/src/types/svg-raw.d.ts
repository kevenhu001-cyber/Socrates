// Type declaration for Vite?s `?raw` suffix imports (inline file contents as
// a string at build time).  Used by nav.js and WorkspacePage.tsx to load
// LobeHub static SVG icons without a runtime fetch.
declare module '*.svg?raw' {
  const src: string;
  export default src;
}

// Type declaration for Vite asset URL imports (emitted file URL at build
// time). Used by connector-icons.ts for the long-tail PNG brand marks.
declare module '*.png' {
  const src: string;
  export default src;
}

// Stylesheet loaded on demand by the whiteboard adapter
// (render/visualizationWhiteboard.ts); Vite injects it as a side effect.
declare module 'tldraw/tldraw.css';
