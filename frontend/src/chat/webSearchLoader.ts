/* Keep the web-search implementation out of the initial chat bundle.
 * Every caller goes through this shared promise so the first search still
 * downloads one module, even when several startup paths request it together. */
let webSearchImport: Promise<typeof import('./webSearch.js')> | null = null;

export function loadWebSearch(): Promise<typeof import('./webSearch.js')> {
  if (!webSearchImport) {
    webSearchImport = import('./webSearch.js');
    webSearchImport.catch((error) => {
      webSearchImport = null;
      console.error('[webSearch] failed to load', error);
    });
  }
  return webSearchImport;
}
