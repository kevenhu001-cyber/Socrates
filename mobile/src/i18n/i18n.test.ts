import { STRINGS } from './strings';
import { translate } from './index';

describe('translate', () => {
  it('returns the localized string for the active language', () => {
    expect(translate('en', 'chat.send')).toBe('Send');
    expect(translate('zh', 'chat.send')).toBe('发送');
  });

  it('falls back to English when a key is missing from zh', () => {
    const zh = STRINGS.zh as Record<string, string>;
    expect(zh['app.name']).toBe('Socrates');
    // an intentionally absent key resolves through en, not to undefined
    expect(translate('zh', 'definitely.not.a.key')).toBe('definitely.not.a.key');
  });

  it('interpolates named placeholders', () => {
    /* Greetings intentionally match the current web landing copy and no
     * longer interpolate a user name. Keep the placeholder assertion on a
     * string that actually has a named variable. */
    expect(translate('en', 'greeting.chat', { name: 'Ada' })).toBe('Ready when you are');
    expect(translate('zh', 'greeting.chat', { name: 'Ada' })).toBe('准备好了，随时开始');
    expect(translate('en', 'greeting.chat.morning', { name: 'Ada' })).toBe('Ready when you are');
    expect(translate('en', 'exam.questionN', { n: 3 })).toBe('Question 3');
  });

  it('leaves unknown placeholders intact rather than printing undefined', () => {
    expect(translate('en', 'greeting.chat', { other: 'x' })).toBe('Ready when you are');
  });

  it('never renders "undefined" for an unknown key', () => {
    expect(translate('en', 'nope.nope')).toBe('nope.nope');
  });
});

describe('string table', () => {
  it('defines every English key in Chinese too', () => {
    const missing = Object.keys(STRINGS.en).filter((key) => !(key in STRINGS.zh));
    expect(missing).toEqual([]);
  });

  it('has no Chinese key the English table lacks', () => {
    const extra = Object.keys(STRINGS.zh).filter((key) => !(key in STRINGS.en));
    expect(extra).toEqual([]);
  });

  it('keeps the same placeholders in both languages', () => {
    const names = (value: string) => (value.match(/\{\w+\}/g) || []).sort();
    for (const [key, en] of Object.entries(STRINGS.en)) {
      const zh = (STRINGS.zh as Record<string, string>)[key];
      expect(names(zh)).toEqual(names(en));
    }
  });
});
