jest.mock('../api/client', () => ({ apiRequest: jest.fn() }));
jest.mock('../../platform/secureStorage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import { apiRequest } from '../api/client';
import { fetchWebContext, shouldRefreshSearch } from './webSearch';

const mockApi = apiRequest as jest.Mock;

beforeEach(() => mockApi.mockReset());

/** The rewriter is the first /chat POST; everything after it is search/fetch. */
function stubPipeline(results: Array<{ title: string; url: string; snippet: string }>) {
  mockApi.mockImplementation((path: string) => {
    if (path === '/chat') return Promise.resolve({ content: '["variant one","variant two"]' });
    if (path === '/web-search') return Promise.resolve({ results });
    if (path === '/fetch-batch') return Promise.resolve({ results: [] });
    return Promise.resolve({});
  });
}

describe('fetchWebContext', () => {
  it('scores, sorts and formats hits into the web [Web research] block', async () => {
    stubPipeline([
      { title: 'Unrelated cooking', url: 'https://a.test/1', snippet: 'pasta recipe' },
      { title: 'PyTorch benchmark guide', url: 'https://b.test/2', snippet: 'PyTorch benchmark speed' },
    ]);
    const pills: Array<[string, number]> = [];
    const outcome = await fetchWebContext('PyTorch benchmark', {
      onPill: (kind, count) => pills.push([kind, count]),
    });

    expect(outcome.ok).toBe(true);
    /* The off-topic hit scores below the web's 30-point floor and is dropped. */
    expect(outcome.hits).toHaveLength(1);
    expect(outcome.hits[0].url).toBe('https://b.test/2');
    expect(outcome.context).toContain('[Web research] — original query: "PyTorch benchmark"');
    expect(outcome.context).toContain('[1] [high relevance] PyTorch benchmark guide');
    expect(outcome.context).toContain('Do NOT add [1]/[2] citation markers');
    expect(pills[0][0]).toBe('loading');
    expect(pills.at(-1)).toEqual(['ok', 1]);
  });

  it('dedupes repeated URLs across query variants', async () => {
    stubPipeline([{ title: 'Same page', url: 'https://c.test/x', snippet: 's' }]);
    const outcome = await fetchWebContext('quantum error correction code', {});
    expect(outcome.results).toBe(1);
    const searches = mockApi.mock.calls.filter(([path]) => path === '/web-search');
    expect(searches.length).toBeGreaterThan(1);
  });

  it('reports a failed pill when every query errors', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/chat') return Promise.resolve({ content: '[]' });
      return Promise.reject(new Error('HTTP 503'));
    });
    const pills: string[] = [];
    const outcome = await fetchWebContext('anything', { onPill: (kind) => pills.push(kind) });
    expect(outcome.ok).toBe(false);
    expect(pills).toContain('err');
  });
});

describe('shouldRefreshSearch', () => {
  it('follows the web five-turn cadence outside the 30s cooldown', () => {
    const now = Date.now();
    expect(shouldRefreshSearch({ enabled: false, lastAt: 0, hasQuery: true, totalQuestions: 5 })).toBe(false);
    expect(shouldRefreshSearch({ enabled: true, lastAt: 0, hasQuery: false, totalQuestions: 5 })).toBe(false);
    expect(shouldRefreshSearch({ enabled: true, lastAt: now - 1000, hasQuery: true, totalQuestions: 5 })).toBe(false);
    expect(shouldRefreshSearch({ enabled: true, lastAt: now - 60_000, hasQuery: true, totalQuestions: 5 })).toBe(true);
    expect(shouldRefreshSearch({ enabled: true, lastAt: now - 60_000, hasQuery: true, totalQuestions: 6 })).toBe(false);
  });
});
