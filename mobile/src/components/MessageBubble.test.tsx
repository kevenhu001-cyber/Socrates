import React from 'react';
import { Animated, Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { Message } from '@socrates/contracts';
import { MessageBubble } from './MessageBubble';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';

const mockUseReducedMotion = jest.fn<boolean | null, []>(() => null);
jest.mock('../native/reducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
  motionAllowed: (preference: boolean | null) => preference === false,
}));

/* Markdown/ToolCard pull in react-native-webview, which has no native
 * module under jest — stub the native component itself. */
jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

function renderBubble(message: Message, props: Partial<React.ComponentProps<typeof MessageBubble>> = {}) {
  return create(
    <I18nProvider>
      <ThemeProvider>
        <MessageBubble message={message} {...props} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

/* The bubble toolbar shares the same labels, so scope row lookups to the
 * action sheet subtree (testID lands on the Overlay surface). Jest keeps a
 * hidden Modal's children mounted, so open state is read off the Modal
 * host's `visible` prop instead of node presence. */
const sheetNodes = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((n) => n.props?.testID === 'message-actions');

const sheetOpen = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((n) => n.type === Modal).some((n) => n.props.visible === true);

const rowLabels = (tree: ReturnType<typeof create>) =>
  sheetNodes(tree).flatMap((sheet) =>
    sheet
      .findAll((n) => n.props?.accessibilityRole === 'button' && typeof n.props?.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string),
  );

const longPress = async (tree: ReturnType<typeof create>) => {
  const target = tree.root.find((n) => typeof n.props?.onLongPress === 'function');
  await act(async () => { target.props.onLongPress(); });
};

const pressRow = async (tree: ReturnType<typeof create>, label: string) => {
  const row = sheetNodes(tree)
    .flatMap((sheet) => sheet.findAll((n) => n.props?.accessibilityLabel === label))
    .find((n) => typeof n.props?.onPress === 'function')!;
  await act(async () => { row.props.onPress(); });
};

function bubbleElement(message: Message) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <MessageBubble message={message} />
      </ThemeProvider>
    </I18nProvider>
  );
}

function renderedText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join('');
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children);
  }
  return '';
}

describe('MessageBubble long-press actions', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(null);
    /* I18nProvider defaults to the device locale — pin English so the
     * assertions below hold on any host. Sheet/Overlay animations use the
     * native driver which jest-expo cannot run; stub them to no-ops. */
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ locale: 'en-US' } as Intl.ResolvedDateTimeFormatOptions);
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    jest.spyOn(Animated, 'timing').mockReturnValue(animation as never);
    jest.spyOn(Animated, 'parallel').mockReturnValue(animation as never);
    jest.spyOn(Animated, 'sequence').mockReturnValue(animation as never);
    jest.spyOn(Animated, 'loop').mockReturnValue(animation as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the full action sheet for a user message', async () => {
    let tree: ReturnType<typeof create> | null = null;
    const onDelete = jest.fn();
    const onEdit = jest.fn();
    const onShare = jest.fn();
    const onBranch = jest.fn();
    await act(async () => {
      tree = renderBubble(
        { id: 'u1', role: 'user', content: 'hello there' },
        { onDelete, onEdit, onShare, onBranch },
      );
    });

    expect(sheetOpen(tree!)).toBe(false);
    await longPress(tree!);
    expect(sheetOpen(tree!)).toBe(true);

    const labels = rowLabels(tree!);
    for (const label of ['Copy', 'Edit message', 'Share conversation', 'Branch from here', 'Re-explain from a different angle', 'Delete message']) {
      expect(labels).toContain(label);
    }
    /* User messages never expose assistant-only actions. */
    expect(labels).not.toContain('Read aloud');
    expect(labels).not.toContain('Helpful');
    expect(labels).not.toContain('Regenerate response');

    await pressRow(tree!, 'Delete message');
    expect(onDelete).toHaveBeenCalledWith('u1');
  });

  it('opens assistant actions: read aloud, feedback and regenerate', async () => {
    let tree: ReturnType<typeof create> | null = null;
    const onRegenerate = jest.fn();
    const onFeedback = jest.fn();
    await act(async () => {
      tree = renderBubble(
        { id: 'a1', role: 'assistant', content: 'the answer' },
        { onRegenerate, onFeedback },
      );
    });

    await longPress(tree!);

    const labels = rowLabels(tree!);
    for (const label of ['Copy', 'Read aloud', 'Regenerate response', 'Helpful', 'Not helpful']) {
      expect(labels).toContain(label);
    }
    /* Assistant messages never expose user-only actions. */
    expect(labels).not.toContain('Edit message');
    expect(labels).not.toContain('Delete message');

    await pressRow(tree!, 'Regenerate response');
    expect(onRegenerate).toHaveBeenCalledWith('a1');

    /* Each row dismisses the sheet on press — reopen for the next row. */
    await longPress(tree!);
    await pressRow(tree!, 'Helpful');
    expect(onFeedback).toHaveBeenCalledWith('a1', 'up');
  });

  it('does not offer long-press while the message is streaming', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = renderBubble({ id: 's1', role: 'assistant', content: 'partial', type: 'streaming' });
    });
    const target = tree!.root.find((n) => typeof n.props?.onLongPress === 'function');
    expect(target.props.disabled).toBe(true);
  });
});

describe('MessageBubble streaming deltas', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(null);
    jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ locale: 'en-US' } as Intl.ResolvedDateTimeFormatOptions);
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    jest.spyOn(Animated, 'timing').mockReturnValue(animation as never);
    jest.spyOn(Animated, 'parallel').mockReturnValue(animation as never);
    jest.spyOn(Animated, 'sequence').mockReturnValue(animation as never);
    jest.spyOn(Animated, 'loop').mockReturnValue(animation as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders each cumulative Chinese delta while an unfinished code fence remains readable', async () => {
    let tree: ReturnType<typeof create> | null = null;
    const cumulative = [
      '你',
      '你好，',
      '你好，世界。',
      '你好，世界。\n\n```ts\nconst answer =',
      '你好，世界。\n\n```ts\nconst answer = 42;',
    ];
    await act(async () => {
      tree = create(bubbleElement({ id: 's-live', role: 'assistant', content: cumulative[0], rawText: cumulative[0], type: 'streaming' }));
    });
    expect(renderedText(tree!.toJSON())).toContain('你');

    for (const text of cumulative.slice(1)) {
      await act(async () => {
        tree!.update(bubbleElement({ id: 's-live', role: 'assistant', content: text, rawText: text, type: 'streaming' }));
      });
      const visible = renderedText(tree!.toJSON());
      expect(visible).toContain(text.split('\n\n```')[0]);
      if (text.includes('const answer =')) expect(visible).toContain('const answer =');
      expect(tree!.root.findAll((n) => n.props?.children === '▍').length).toBeGreaterThan(0);
    }
  });

  it('keeps the first streamed character fully visible and settles partial Markdown without a caret on stop', async () => {
    let tree: ReturnType<typeof create> | null = null;
    const first = '你';
    const partial = '你好\n\n```ts\nconst answer = 42;';
    await act(async () => {
      tree = create(bubbleElement({ id: 's-stop', role: 'assistant', content: first, rawText: first, type: 'streaming' }));
    });
    expect(renderedText(tree!.toJSON())).toContain(first);

    await act(async () => {
      tree!.update(bubbleElement({ id: 's-stop', role: 'assistant', content: partial, rawText: partial, type: 'streaming' }));
    });
    expect(renderedText(tree!.toJSON())).toContain('const answer = 42;');

    await act(async () => {
      tree!.update(bubbleElement({ id: 's-stop', role: 'assistant', content: partial, rawText: partial, type: 'assistant' }));
    });
    expect(renderedText(tree!.toJSON())).toContain('const answer = 42;');
    expect(tree!.root.findAll((node) => node.props?.children === '▍')).toHaveLength(0);
  });

  it('does not start decorative streaming loops when reduced motion is enabled', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(bubbleElement({ id: 's-reduced', role: 'assistant', content: '正在回答', rawText: '正在回答', type: 'streaming' }));
    });
    expect(Animated.loop).not.toHaveBeenCalled();
    expect(renderedText(tree!.toJSON())).toContain('正在回答');
  });

  it('shows inline-think text delivered through reasoningContent in the thinking panel', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = renderBubble({
        id: 's-think',
        role: 'assistant',
        content: 'User-facing answer',
        rawText: 'User-facing answer',
        reasoningContent: 'Inline thought routed from inline tags',
        type: 'streaming',
      });
    });

    const trigger = tree!.root.find((node) => node.props?.accessibilityLabel === 'Thinking…' && typeof node.props?.onPress === 'function');
    await act(async () => { trigger.props.onPress(); });

    const visible = renderedText(tree!.toJSON());
    expect(visible).toContain('Inline thought routed from inline tags');
    expect(visible).toContain('User-facing answer');
  });
});
