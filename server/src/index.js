/**
 * Production compatibility entry.
 *
 * Existing systemd installations may still execute `node src/index.js`.
 * The TypeScript migration compiles the mixed JS/TS source tree to dist,
 * so this stable entry delegates to the compiled runtime without requiring
 * an immediate service-unit change on every deployment.
 */
import '../dist/index.runtime.js';
