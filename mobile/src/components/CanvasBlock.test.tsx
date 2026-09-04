import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { CanvasBlock } from './CanvasBlock';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('../render/MarkdownView', () => ({ Markdown: () => null }));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('CanvasBlock', () => {
  it('switches into edit mode and sends the revised text back to chat', async () => {
    const onIterate = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(<ThemeProvider><CanvasBlock originalText="Original draft" onIterate={onIterate} /></ThemeProvider>);
    });

    await act(async () => {
      tree!.root.findByProps({ accessibilityLabel: 'Edit' }).props.onPress();
    });
    const editor = tree!.root.findByType(TextInput);
    await act(async () => {
      editor.props.onChangeText('Revised draft');
      tree!.root.findByProps({ accessibilityLabel: 'Done' }).props.onPress();
    });
    await act(async () => {
      tree!.root.findByProps({ accessibilityLabel: 'Iterate' }).props.onPress();
    });
    expect(onIterate).toHaveBeenCalledWith('Revised draft');
  });
});
