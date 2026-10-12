import { createInlineThinkRouter } from './inlineThinkRouter';

describe('createInlineThinkRouter', () => {
  it('routes split inline think tags to reasoning while preserving surrounding answer text', () => {
    const answer: string[] = [];
    const thinking: string[] = [];
    const router = createInlineThinkRouter(
      (text) => answer.push(text),
      (text) => thinking.push(text),
    );

    router.push('答案 <thi');
    router.push('nk>推');
    router.push('理过程</thi');
    router.push('nk> 继续回答');
    router.finish();

    expect(answer.join('')).toBe('答案  继续回答');
    expect(thinking.join('')).toBe('推理过程');
  });

  it('routes multiple thought blocks in order and does not emit the tags', () => {
    const answer: string[] = [];
    const thinking: string[] = [];
    const router = createInlineThinkRouter(
      (text) => answer.push(text),
      (text) => thinking.push(text),
    );

    router.push('before <think>first</think> middle <THINK>second</THINK> after');
    router.finish();

    expect(answer.join('')).toBe('before  middle  after');
    expect(thinking.join('\n\n')).toBe('first\n\nsecond');
  });

  it('flushes an unfinished thought at finish and drops a partial opening tag', () => {
    const answer: string[] = [];
    const thinking: string[] = [];
    const router = createInlineThinkRouter(
      (text) => answer.push(text),
      (text) => thinking.push(text),
    );

    router.push('visible <think>unfinished thought</thi');
    router.finish();
    router.push(' ignored after finish');

    expect(answer.join('')).toBe('visible ');
    expect(thinking.join('')).toBe('unfinished thought</thi');

    const dangling: string[] = [];
    const partial = createInlineThinkRouter((text) => dangling.push(text));
    partial.push('plain <thi');
    partial.finish();
    expect(dangling.join('')).toBe('plain ');
  });

  it('streams long reasoning in bounded chunks without duplicating its tail on finish', () => {
    const thinking: string[] = [];
    const payload = `${'a'.repeat(200)}tail`;
    const router = createInlineThinkRouter(undefined, (text) => thinking.push(text));

    router.push(`<think>${'a'.repeat(200)}`);
    router.push('tail</think>');
    router.finish();

    expect(thinking).toEqual(['a'.repeat(200), 'tail']);
    expect(thinking.join('')).toBe(payload);
  });
});
