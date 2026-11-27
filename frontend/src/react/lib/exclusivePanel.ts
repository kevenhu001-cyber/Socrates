const closers = new Map<string, () => void>();

/** Registers an overlay/side-panel closer so sibling panels open mutually exclusively. */
export function registerExclusivePanel(id: string, close: () => void): () => void {
  closers.set(id, close);
  return () => {
    if (closers.get(id) === close) closers.delete(id);
  };
}

export function closeOtherPanels(activeId: string): void {
  for (const [id, close] of closers) {
    if (id !== activeId) close();
  }
}
