import { highlightedTokens, highlightLanguage, hlStyleFor, parseHighlightedHtml } from './highlight';

describe('highlightLanguage', () => {
  it('resolves aliases to registered grammars', () => {
    expect(highlightLanguage('js')).toBe('javascript');
    expect(highlightLanguage('TS')).toBe('typescript');
    expect(highlightLanguage('py')).toBe('python');
    expect(highlightLanguage('html')).toBe('xml');
  });

  it('returns empty string for unknown or blank tags, like the web safeHljsLang', () => {
    expect(highlightLanguage('')).toBe('');
    expect(highlightLanguage('brainfuck')).toBe('');
    expect(highlightLanguage('go')).toBe('');
  });
});

describe('parseHighlightedHtml', () => {
  it('maps span classes to flat scoped runs and decodes entities', () => {
    const html = '<span class="hljs-keyword">const</span> a <span class="hljs-operator">=</span> <span class="hljs-string">&quot;x&quot;</span>;';
    expect(parseHighlightedHtml(html)).toEqual([
      { text: 'const', scope: 'keyword' },
      { text: ' a ', scope: null },
      { text: '=', scope: 'operator' },
      { text: ' ', scope: null },
      { text: '"x"', scope: 'string' },
      { text: ';', scope: null },
    ]);
  });

  it('merges adjacent runs with the same scope', () => {
    expect(parseHighlightedHtml('<span class="hljs-string">a&amp;b</span>')).toEqual([
      { text: 'a&b', scope: 'string' },
    ]);
  });
});

describe('highlightedTokens', () => {
  it('tokenizes a known language and preserves the source text', () => {
    const code = 'const n = 42;\n// hi';
    const tokens = highlightedTokens(code, 'js');
    expect(tokens).not.toBeNull();
    expect(tokens!.map((t) => t.text).join('')).toBe(code);
    expect(tokens!.some((t) => t.scope === 'keyword' && t.text === 'const')).toBe(true);
    expect(tokens!.some((t) => t.scope === 'number' && t.text === '42')).toBe(true);
  });

  it('returns null for unregistered languages so CodeBlock falls back to plain text', () => {
    expect(highlightedTokens('x = 1', 'ruby')).toBeNull();
  });
});

describe('hlStyleFor', () => {
  it('maps scopes to the web One Dark palette in dark mode', () => {
    expect(hlStyleFor('keyword', true)).toEqual({ color: '#c678dd' });
    expect(hlStyleFor('comment', true)).toEqual({ color: '#5c6370', fontStyle: 'italic' });
    expect(hlStyleFor(null, true)).toEqual({});
  });

  it('uses Atom One Light colours in light mode', () => {
    expect(hlStyleFor('keyword', false)).toEqual({ color: '#a626a4' });
  });
});
