// Type declaration for Vite?s `?raw` suffix imports (inline file contents as
// a string at build time).  Used by nav.js and WorkspacePage.tsx to load
// LobeHub static SVG icons without a runtime fetch.
declare module '*.svg?raw' {
  const src: string;
  export default src;
}
