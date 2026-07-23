/**
 * Production compatibility entry.
 *
 * Existing systemd installations may still execute `node src/index.js`.
 * The TypeScript build emits dist/, so this stable entry delegates to the
 * compiled runtime without requiring an immediate service-unit change on
 * every deployment. Once the systemd units are updated to point directly
 * at dist/index.runtime.js, this shim can be removed.
 */
import '../dist/index.runtime.js';
