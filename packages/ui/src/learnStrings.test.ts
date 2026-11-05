import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultLearnStrings, learnStrings, type LearnStrings } from './learn/strings.ts';

function keyPaths(strings: LearnStrings): string[] {
  return [
    ...Object.keys(strings.label).map((key) => `label.${key}`),
    ...Object.keys(strings.rating).map((key) => `rating.${key}`),
    ...Object.keys(strings.ratingNote).map((key) => `ratingNote.${key}`),
    ...Object.keys(strings).filter((key) => !['label', 'rating', 'ratingNote'].includes(key)),
  ].sort();
}

test('every learn label is filled in, in every language', () => {
  for (const language of ['en', 'zh'] as const) {
    const strings = learnStrings(language);
    for (const path of keyPaths(strings)) {
      const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], strings);
      assert.equal(typeof value, 'string', `${language}.${path} must be a string`);
      assert.ok((value as string).length > 0, `${language}.${path} must not be empty`);
    }
  }
});

test('the Chinese table carries every key the English table has', () => {
  assert.deepEqual(keyPaths(learnStrings('zh')), keyPaths(defaultLearnStrings));
});

test('the Chinese table is translated, not a copy of the English one', () => {
  const en = learnStrings('en');
  const zh = learnStrings('zh');
  assert.equal(en.label.quiz, 'Quiz');
  assert.equal(zh.label.quiz, '选择题');
  assert.equal(en.quizSubmit, 'Check answer');
  assert.equal(zh.quizSubmit, '提交答案');
});
