import { createElement } from 'react';
import { createObservedRootGroup } from '../lib/boot/observedRootGroup';
import { WebSearchResults } from './WebSearchResults';
import type { NormalizedSearchResult } from '../../ui/toolSearchResultsModel.ts';

const roots = createObservedRootGroup('web-search-results', { synchronous: true });

export function renderWebSearchResults(host: HTMLElement, sources: NormalizedSearchResult[], query: string): void {
  roots.render(host, createElement(WebSearchResults, { sources, query }));
}
