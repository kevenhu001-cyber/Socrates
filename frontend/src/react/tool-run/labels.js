/* Re-export shim — TypeScript source lives in ./labels.ts. Exists so the raw
   Node ESM resolver (used by test/*.test.mjs) can follow the `./labels.js`
   specifier that Vite and tsc resolve to the .ts file. */
export * from './labels.ts';
