import React from 'react';
import { Animated, Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { Message } from '@socrates/contracts';
import { MessageBubble } from './MessageBubble';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';

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

describe('MessageBubble long-press actions', () => {
  beforeEach(() => {
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
