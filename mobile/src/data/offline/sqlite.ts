/* Metro selects sqlite.native.ts or sqlite.web.ts at bundle time. This
   platform-neutral fallback keeps TypeScript and non-Metro tooling pointed at
   the browser-safe implementation. */
export * from './sqlite.web';
