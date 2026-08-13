/* Platform entrypoint fallback. Metro resolves the native or Web adapter for
   app bundles; the Web implementation keeps Jest/TypeScript tooling safe. */
export * from './secureStorage.web';
