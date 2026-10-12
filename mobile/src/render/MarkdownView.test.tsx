import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Markdown } from './MarkdownView';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';
import { AnimatedPressable } from '../components/AnimatedPressable';

jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./RichBlock', () => {
  const ReactRuntime = require('react');
  const ReactNative = require('react-native');
  return {
    RichBlock: ({ body, fallbackText }: { body: string; fallbackText: string }) =>
      ReactRuntime.createElement(ReactNative.View, { testID: 'math-rich-block', body, fallbackText }),
    chartBody: (body: string) => body,
    mathBody: (body: string) => body,
    mermaidBody: (body: string) => body,
  };
});

const QUIZ = [
  '<quiz>',
  '<q>What is $x^2$?</q>',
  '<o letter="A">$a^2$</o>',
  '<o letter="B">plain option</o>',
  '<correct>A</correct>',
  '</quiz>',
].join('\n');
const TABLE = '| Formula | Value |\n| --- | --- |\n| $t^2$ | 1 |';

function element(text: string) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <Markdown text={text} streaming />
      </ThemeProvider>
    </I18nProvider>
  );
}

function allText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('');
  if (node && typeof node === 'object' && 'children' in node) {
    return allText((node as { children?: unknown }).children);
  }
  return '';
}

function quizOptionButtons(tree: ReactTestRenderer): ReactTestInstance[] {
  return tree.root.findAll((node) => node.type === AnimatedPressable && typeof node.props?.accessibilityState?.selected === 'boolean');
}

describe('MarkdownView streaming renderer', () => {
  it('routes inline formulas in quiz questions, options, and table cells through KaTeX instead of native raw-LaTeX text', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => { tree = create(element(`${QUIZ}\n\n${TABLE}\n\nAn active tail`)); });

    const formulaBlocks = tree!.root.findAll((node) => typeof node.type === 'string' && node.props?.testID === 'math-rich-block');
    expect(formulaBlocks).toHaveLength(3);
    expect(formulaBlocks.map((node) => node.props.body)).toEqual(expect.arrayContaining([
      expect.stringContaining('data-math="x^2"'),
      expect.stringContaining('data-math="a^2"'),
      expect.stringContaining('data-math="t^2"'),
    ]));
    expect(allText(tree!.toJSON())).not.toContain('x^2');
    expect(allText(tree!.toJSON())).not.toContain('a^2');
    expect(allText(tree!.toJSON())).not.toContain('t^2');
    await act(async () => { tree?.unmount(); });
  });

  it('preserves a completed widget component and its local answer state as the active tail grows', async () => {
    let tree: ReactTestRenderer | null = null;
    const first = `${QUIZ}\n\nThe answer is starting`;
    await act(async () => { tree = create(element(first)); });

    const firstOption = quizOptionButtons(tree!)[0];
    await act(async () => { firstOption.props.onPress(); });
    expect(quizOptionButtons(tree!).filter((node) => node.props.accessibilityState.selected)).toHaveLength(1);

    await act(async () => {
      tree!.update(element(`${first} and continues`));
    });
    expect(quizOptionButtons(tree!).filter((node) => node.props.accessibilityState.selected)).toHaveLength(1);
    await act(async () => { tree?.unmount(); });
  });
});
