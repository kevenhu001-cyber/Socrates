/* Platform entrypoint fallback for TypeScript and non-Metro tooling. Native
   and Web bundlers resolve push.native.ts / push.web.ts first. */
export * from './push.web';
