/* Re-export shim — TypeScript source lives in ./toolCategory.ts. Keeps
   `from '../render/toolCategory.js'` resolving under the raw Node/test
   resolver, matching the shim convention used by helpers.js /
   toolCardView.js / toolInline.js. The TS source is canonical. */
export * from './toolCategory.ts';
