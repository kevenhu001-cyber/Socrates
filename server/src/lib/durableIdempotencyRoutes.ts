/** Paths relative to the global /api middleware mount. Keep paired with the
 * authenticated transactional handlers; bypass pre-auth process-local replay. */
export function usesDurableIdempotency(method: string, path: string): boolean {
  const normalized = path.toLowerCase().replace(/\/+$/, '');
  const m = method.toUpperCase();
  if (m === 'POST') {
    if (['/projects', '/prompts', '/scheduled-tasks'].includes(normalized)) return true;
    if (/^\/sessions\/[^/]+\/archive$/.test(normalized)) return true;
    return false;
  }
  if (m === 'PUT') return /^\/sessions\/[^/]+\/tags$/.test(normalized);
  if (m === 'PATCH') return ['/users/me', '/users/me/preferences'].includes(normalized);
  return false;
}

