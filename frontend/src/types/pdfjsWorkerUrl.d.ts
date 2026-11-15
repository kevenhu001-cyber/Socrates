/* pdf.js worker is loaded from its own emitted asset, matching the maplibre
   worker pattern (src/types/maplibre-worker.d.ts). */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const pdfWorkerUrl: string;
  export default pdfWorkerUrl;
}
