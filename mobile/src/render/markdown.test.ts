import { hasMath, hideUnclosedWidgetTail, inlineToHtml, inlineToText, parseInline, parseMarkdown, safeHref, stripCitationMarkers, type Block } from './markdown';

function types(blocks: Block[]): string[] {
  return blocks.map((block) => block.type);
}

describe('parseMarkdown blocks', () => {
  it('parses headings, paragraphs and rules', () => {
    const blocks = parseMarkdown('# Title\n\nSome body text.\n\n---\n\n## Next');
    expect(types(blocks)).toEqual(['heading', 'paragraph', 'hr', 'heading']);
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(blocks[3]).toMatchObject({ type: 'heading', level: 2 });
  });

  it('keeps fenced code verbatim and records its language', () => {
    const blocks = parseMarkdown('```python\nx = 1\n\n  y = 2\n```');
    expect(blocks).toEqual([{ type: 'code', lang: 'python', text: 'x = 1\n\n  y = 2', closed: true }]);
  });

  it('marks an unterminated fence as open so streaming can show it as text', () => {
    const blocks = parseMarkdown('```js\nconst a = ');
    expect(blocks[0]).toMatchObject({ type: 'code', closed: false, text: 'const a = ' });
  });

  it('routes mermaid, plot and html fences to the WebView path', () => {
    expect(parseMarkdown('```mermaid\ngraph TD;\n```')[0]).toMatchObject({ type: 'viz', kind: 'mermaid' });
    expect(parseMarkdown('```echarts\n{}\n```')[0]).toMatchObject({ type: 'viz', kind: 'plot' });
    expect(parseMarkdown('```html\n<b>hi</b>\n```')[0]).toMatchObject({ type: 'viz', kind: 'html' });
    // An unlabelled fence containing SVG is markup too, matching the web sniffer.
    expect(parseMarkdown('```\n<svg width="10"></svg>\n```')[0]).toMatchObject({ type: 'viz', kind: 'html' });
  });

  it('does not treat an ordinary unlabelled fence as viz', () => {
    expect(parseMarkdown('```\nplain text\n```')[0]).toMatchObject({ type: 'code', lang: '' });
  });

  it('parses single-line and multi-line display math', () => {
    expect(parseMarkdown('$$a^2 + b^2$$')[0]).toEqual({ type: 'math', text: 'a^2 + b^2', closed: true });
    expect(parseMarkdown('$$\n\\int_0^1 x\\,dx\n$$')[0]).toEqual({ type: 'math', text: '\\int_0^1 x\\,dx', closed: true });
  });

  it('marks unterminated display math as open', () => {
    expect(parseMarkdown('$$\n\\frac{1}{2')[0]).toEqual({ type: 'math', text: '\\frac{1}{2', closed: false });
  });

  it('parses bullet, ordered, nested and task lists', () => {
    const blocks = parseMarkdown('- one\n- two\n  - nested\n');
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: false });
    const list = blocks[0] as Extract<Block, { type: 'list' }>;
    expect(list.items.map((item) => item.depth)).toEqual([0, 0, 1]);

    const ordered = parseMarkdown('1. first\n2. second\n3. third')[0] as Extract<Block, { type: 'list' }>;
    expect(ordered.ordered).toBe(true);
    // Renumbered from the document order, so `1. 1. 1.` still renders 1/2/3.
    expect(ordered.items.map((item) => item.index)).toEqual([1, 2, 3]);

    const tasks = parseMarkdown('- [ ] todo\n- [x] done')[0] as Extract<Block, { type: 'list' }>;
    expect(tasks.items.map((item) => item.checked)).toEqual([false, true]);
  });

  it('parses blockquotes recursively', () => {
    const quote = parseMarkdown('> ## Heading\n> body')[0] as Extract<Block, { type: 'quote' }>;
    expect(quote.type).toBe('quote');
    expect(types(quote.blocks)).toEqual(['heading', 'paragraph']);
  });

  it('parses GFM tables', () => {
    const table = parseMarkdown('| a | b |\n| --- | :-: |\n| 1 | 2 |\n| 3 | 4 |')[0] as Extract<Block, { type: 'table' }>;
    expect(table.type).toBe('table');
    expect(table.header.map(inlineToText)).toEqual(['a', 'b']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1].map(inlineToText)).toEqual(['3', '4']);
  });

  it('needs a divider row to treat pipes as a table', () => {
    expect(parseMarkdown('| a | b |\nnot a divider')[0].type).toBe('paragraph');
  });

  it('returns nothing for empty or whitespace input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n\n ')).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
    expect(parseMarkdown(undefined)).toEqual([]);
  });
});

describe('parseInline', () => {
  it('parses bold, italic, strikethrough and inline code', () => {
    expect(parseInline('**b** *i* ~~s~~ `c`')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'i' }] },
      { type: 'text', text: ' ' },
      { type: 'del', children: [{ type: 'text', text: 's' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
    ]);
  });

  it('leaves snake_case identifiers alone', () => {
    expect(parseInline('call some_long_name here')).toEqual([{ type: 'text', text: 'call some_long_name here' }]);
  });

  it('parses inline math but not currency', () => {
    expect(parseInline('mass is $e = mc^2$ ok')).toEqual([
      { type: 'text', text: 'mass is ' },
      { type: 'math', text: 'e = mc^2' },
      { type: 'text', text: ' ok' },
    ]);
    expect(parseInline('it costs $5 and $10 total')).toEqual([{ type: 'text', text: 'it costs $5 and $10 total' }]);
  });

  it('parses \\( \\) and \\[ \\] math delimiters', () => {
    expect(parseInline('see \\(x_1\\) and \\[y\\]')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'math', text: 'x_1' },
      { type: 'text', text: ' and ' },
      { type: 'math', text: 'y' },
    ]);
  });

  it('parses links, bare URLs and images', () => {
    expect(parseInline('[docs](https://a.test/x)')).toEqual([
      { type: 'link', href: 'https://a.test/x', children: [{ type: 'text', text: 'docs' }] },
    ]);
    expect(parseInline('go to https://a.test/page.')).toEqual([
      { type: 'text', text: 'go to ' },
      { type: 'link', href: 'https://a.test/page', children: [{ type: 'text', text: 'https://a.test/page' }] },
      { type: 'text', text: '.' },
    ]);
    expect(parseInline('![alt](https://a.test/i.png)')).toEqual([
      { type: 'link', href: 'https://a.test/i.png', children: [{ type: 'text', text: 'alt' }] },
    ]);
  });

  it('treats an unclosed marker as literal text', () => {
    expect(parseInline('a **b')).toEqual([{ type: 'text', text: 'a **b' }]);
    expect(parseInline('a `b')).toEqual([{ type: 'text', text: 'a `b' }]);
    expect(parseInline('a $b')).toEqual([{ type: 'text', text: 'a $b' }]);
  });

  it('honours backslash escapes', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([{ type: 'text', text: '*not italic*' }]);
  });

  it('never leaves markdown markers inside code spans', () => {
    expect(parseInline('`a **b** c`')).toEqual([{ type: 'code', text: 'a **b** c' }]);
  });
});

describe('helpers', () => {
  it('detects math anywhere in the tree', () => {
    expect(hasMath(parseInline('plain text'))).toBe(false);
    expect(hasMath(parseInline('**bold $x$**'))).toBe(true);
  });

  it('flattens to plain text', () => {
    expect(inlineToText(parseInline('**a** `b` [c](https://d.test)'))).toBe('a b c');
  });

  it('escapes HTML and hands math to the WebView as data attributes', () => {
    expect(inlineToHtml(parseInline('<script>alert(1)</script>')))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(inlineToHtml(parseInline('$x^2$'))).toBe('<span data-math="x^2" data-display="0"></span>');
  });

  it('drops dangerous link schemes but keeps the label', () => {
    expect(safeHref('https://a.test')).toBe('https://a.test');
    expect(safeHref('mailto:a@b.test')).toBe('mailto:a@b.test');
    expect(safeHref('/relative/path')).toBe('/relative/path');
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(safeHref('data:text/html,<script>')).toBe('');
    expect(inlineToHtml(parseInline('[click](javascript:alert(1))'))).toBe('click');
  });
});

describe('stripCitationMarkers 1:1 with frontend helpers.ts', () => {
  it('strips bracket runs but keeps links and code', () => {
    expect(stripCitationMarkers('Paris is great [1].')).toBe('Paris is great.');
    expect(stripCitationMarkers('A [1][2][3] test')).toBe('A test');
    expect(stripCitationMarkers('See [1](https://example.com) here')).toBe('See [1](https://example.com) here');
    expect(stripCitationMarkers('`code [1]` and text [2]')).toBe('`code [1]` and text');
  });

  it('is idempotent', () => {
    const once = stripCitationMarkers('Text [1] here');
    expect(stripCitationMarkers(once)).toBe(once);
  });
});

describe('tutor widgets 1:1 with frontend widgetParsers.ts', () => {
  const quiz = '<quiz>\n<q>What is 2 + 2?</q>\n<o letter="A">3</o>\n<o letter="B">4</o>\n<correct>B</correct>\n</quiz>';

  it('parses a quiz block with options and answer', () => {
    const blocks = parseMarkdown(`Intro\n\n${quiz}\n\nOutro`);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'widget', 'paragraph']);
    const widget = blocks[1];
    if (widget.type !== 'widget') throw new Error('expected widget');
    expect(widget.kind).toBe('quiz');
    expect(widget.q).toBe('What is 2 + 2?');
    expect(widget.options).toEqual([
      { letter: 'A', text: '3' },
      { letter: 'B', text: '4' },
    ]);
    expect(widget.correct).toBe('B');
  });

  it('rejects quizzes with fewer than two options', () => {
    const blocks = parseMarkdown('<quiz>\n<q>Q?</q>\n<o letter="A">only</o>\n</quiz>');
    expect(blocks.every((b) => b.type !== 'widget')).toBe(true);
  });

  it('parses flashcards, definitions and key points', () => {
    const source = [
      '<flashcard>\n<front>Front</front>\n<back>Back</back>\n</flashcard>',
      '<definition>\n<term>Group</term>\n<body>A set with an operation.</body>\n</definition>',
      '<key-point>\nKeep it simple.\n</key-point>',
    ].join('\n\n');
    const widgets = parseMarkdown(source).filter((b) => b.type === 'widget');
    expect(widgets.map((b) => (b.type === 'widget' ? b.kind : ''))).toEqual([
      'flashcard',
      'definition',
      'key-point',
    ]);
  });

  it('hoists an inline proof out of a theorem', () => {
    const blocks = parseMarkdown('<theorem>\n<title>Pythagoras</title>\n<statement>a^2 + b^2 = c^2</statement>\n<proof>By rearrangement.</proof>\n</theorem>');
    const widget = blocks[0];
    if (widget.type !== 'widget') throw new Error('expected widget');
    expect(widget.statement).toBe('a^2 + b^2 = c^2');
    expect(widget.proof).toBe('By rearrangement.');
  });

  it('holds back an unclosed trailing tag while streaming', () => {
    expect(hideUnclosedWidgetTail('Hello\n\n<quiz>\n<q>Half')).toBe('Hello');
    expect(hideUnclosedWidgetTail(`Done\n\n${quiz}\n\nTail`)).toContain('Tail');
  });
});
