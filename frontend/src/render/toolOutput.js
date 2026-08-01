/* Re-export shim — TypeScript source lives in ./toolOutput.ts. This file
   exists only to keep the existing `from '../render/toolOutput.js'` imports
   working without renaming every importer. The TS source is canonical. */
export * from './toolOutput.ts';
