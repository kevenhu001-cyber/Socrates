import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type DisclosureState = {
  expanded: ReadonlySet<string>;
  setExpanded: (id: string, open: boolean) => void;
};
const ToolRunDisclosure = createContext<DisclosureState | null>(null);

/** A tool can move into a settled group without losing the reader's choice. */
export function ToolRunDisclosureProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpandedTools] = useState<ReadonlySet<string>>(() => new Set());
  const setExpanded = useCallback((id: string, open: boolean) => {
    setExpandedTools((current) => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ expanded, setExpanded }), [expanded, setExpanded]);
  return <ToolRunDisclosure.Provider value={value}>{children}</ToolRunDisclosure.Provider>;
}

export function useToolRunDisclosure(id: string) {
  const context = useContext(ToolRunDisclosure);
  const [localOpen, setLocalOpen] = useState(false);
  return {
    open: context ? context.expanded.has(id) : localOpen,
    setOpen: (open: boolean) => context ? context.setExpanded(id, open) : setLocalOpen(open),
  };
}

export function useExpandedToolIds() {
  return useContext(ToolRunDisclosure)?.expanded;
}
