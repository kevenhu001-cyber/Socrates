export function createInitialSearchState() {
  return {
    searchContext: null,
    searchResults: [],
    searchContextAt: 0,
    searchContextCount: 0,
    searchContextQuery: null,
    searchContextError: null,
  };
}

export type SearchState = ReturnType<typeof createInitialSearchState>;
