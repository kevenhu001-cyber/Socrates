/**
 * Production compatibility entry.
 *
 * Existing systemd installations may still execute `node src/index.js`.
 * The TypeScript build emits dist/, so this stable entry delegates to the
 * compiled runtime without requiring an immediate service-unit change on
 * every deployment. npm start and Docker now use the compiled runtime
 * directly. Remove this shim only after deployed units and rollback paths
 * are verified.
 */
import '../dist/index.runtime.js';
