export const SEARCH_FLAT_KEYS = {
  searchContext: 'context',
  searchResults: 'results',
  searchContextAt: 'contextAt',
  searchContextCount: 'contextCount',
  searchContextQuery: 'contextQuery',
  searchContextError: 'error',
} as const;

export function createInitialSearchState() {
  return {
    context: null,
    results: [],
    contextAt: 0,
    contextCount: 0,
    contextQuery: null,
    error: null,
  };
}

export type SearchState = ReturnType<typeof createInitialSearchState>;
