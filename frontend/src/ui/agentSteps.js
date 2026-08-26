/* Re-export shim — TypeScript source lives in ./agentSteps.ts. Keeps
   `from '../ui/agentSteps.js'` resolving under the raw Node/test resolver,
   matching the shim convention used by toolInline.js / toolCardView.js /
   helpers.js. The TS source is canonical. */
export * from './agentSteps.ts';
