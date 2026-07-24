/* Re-export shim — TypeScript source lives in ./helpers.ts. This file
   exists only to keep the existing `from '../render/helpers.js'` imports
   working without renaming every importer. The TS source is canonical. */
export * from './helpers.ts';