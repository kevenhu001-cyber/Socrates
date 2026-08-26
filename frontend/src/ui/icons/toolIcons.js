/* Re-export shim — TypeScript source lives in ./toolIcons.ts. Keeps
   `from './icons/toolIcons.js'` resolving under the raw Node/test
   resolver, matching the shim convention used by helpers.js /
   toolCardView.js / toolInline.js. The TS source is canonical. */
export * from './toolIcons.ts';
