export function createInitialSearchState() {
  return {
    searchContext: null as string | null,
    searchResults: [] as unknown[],
    searchContextAt: 0,
    searchContextCount: 0,
    searchContextQuery: null as string | null,
    searchContextError: null as string | null,
  };
}

export type SearchState = ReturnType<typeof createInitialSearchState>;
