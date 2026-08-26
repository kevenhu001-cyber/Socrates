/* Re-export shim — TypeScript source lives in ./toolCardView.ts. This
   file exists only to keep `from './toolCardView.js'` imports resolving
   under the raw Node/test resolver and legacy importers, matching the
   shim convention used by helpers.js / toolRunState.js. The TS source
   is canonical. */
export * from './toolCardView.ts';
