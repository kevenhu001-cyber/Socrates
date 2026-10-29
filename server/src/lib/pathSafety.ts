/**
 * Path containment helpers.
 *
 * Every filesystem call that receives a path from outside the module it
 * lives in — a multipart upload's temporary path, a persisted
 * `storagePath`, a workspace key — goes through this module first. The
 * resolved path must stay inside the server-owned root, so a `../`
 * segment, an absolute path, or a symlinked parent can never reach a
 * file the caller does not own.
 *
 * The containment check is deliberately written as
 * `resolved === root || resolved.startsWith(root + sep)`: a bare
 * `startsWith(root)` would accept `/var/lib/socrates/uploads-evil`, and
 * the `=== root` arm keeps the root directory itself addressable.
 */

import path from 'node:path';
import { ApiError } from './errors.js';

/** True when `candidate`, resolved against `root`, stays inside `root`. */
export function isInsideRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, String(candidate ?? ''));
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

/**
 * Resolve `candidate` inside `root`, throwing when it escapes.
 *
 * Relative candidates are resolved against the root (so callers can pass
 * either a bare entry name or an absolute path that is still contained).
 */
export function resolveInsideRoot(root: string, candidate: string, message = 'path_outside_root'): string {
  if (!isInsideRoot(root, candidate)) throw new ApiError(400, 'INVALID_PATH', message);
  return path.resolve(path.resolve(root), String(candidate ?? ''));
}
