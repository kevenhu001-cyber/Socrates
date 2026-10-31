import { webSearchOn, setWebSearchOn } from '../config/providers.ts';
import { stateStore } from '../state/store.ts';
import { loadWebSearch } from './webSearchLoader.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

function fetchSearchContext(topic: string): void {
  void loadWebSearch()
    .then((module) => module.fetchWebContext(topic))
    .catch((error) => reportSwallow(error, 'chat.webSearchToggle.fetchContext'));
}

/** Toggle the web-search preference and keep active search context in sync. */
export function toggleWebSearch(): void {
  const next = setWebSearchOn(!webSearchOn);
  const topic = stateStore.read('topic');
  if (!next) {
    stateStore.dispatch({ type: 'state/batch', patch: {
      searchContext: '',
      searchContextAt: 0,
      searchContextCount: 0,
      searchContextError: null,
      searchContextQuery: null,
    } });
  } else if (topic) {
    fetchSearchContext(topic);
  }
}

/** Restore search context after boot or auth refresh when the preference is on. */
export function syncWebSearchUI(): void {
  const topic = stateStore.read('topic');
  if (webSearchOn && topic && !stateStore.read('searchContext')) {
    fetchSearchContext(topic);
  }
}
