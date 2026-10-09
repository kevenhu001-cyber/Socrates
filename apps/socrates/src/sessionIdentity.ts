const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Restrict server-scoped message operations to persisted UUID session ids. */
export function uuidScope(id: string | null | undefined): string | null {
  return id && UUID_RE.test(id) ? id : null;
}
