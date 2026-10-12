import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { HomeQuickActions } from './HomeQuickActions';
import { AnimatedPressable } from './AnimatedPressable';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./AnimatedPressable', () => {
  const ReactActual = require('react');
  const { Pressable: NativePressable } = jest.requireActual('react-native');
  return {
    AnimatedPressable: (props: Record<string, unknown>) => ReactActual.createElement(
      NativePressable,
      props,
      props.children,
    ),
  };
});

describe('HomeQuickActions', () => {
  it('renders web-parity copy and dispatches upload, write and search actions', async () => {
    const onUpload = jest.fn();
    const onWrite = jest.fn();
    const onResearch = jest.fn();
    let tree: ReturnType<typeof create> | undefined;
    await act(async () => {
      tree = create(
        <I18nProvider>
          <ThemeProvider>
            <HomeQuickActions onUpload={onUpload} onWrite={onWrite} onResearch={onResearch} />
          </ThemeProvider>
        </I18nProvider>,
      );
    });
    const rendered = tree!;

    const expected = [
      ['home-quick-action-upload', 'Add images or files', onUpload],
      ['home-quick-action-write', 'Write or edit', onWrite],
      ['home-quick-action-research', 'Search the web', onResearch],
    ] as const;
    for (const [testID, label, action] of expected) {
      const button = rendered.root.findAllByType(AnimatedPressable).find((node) => node.props.testID === testID);
      expect(button).toBeDefined();
      expect(button!.findAllByType(Text).some((node) => node.props.children === label)).toBe(true);
      act(() => button!.props.onPress());
      expect(action).toHaveBeenCalledTimes(1);
    }
  });

  it('dismisses only the selected shortcut row', async () => {
    let tree: ReturnType<typeof create> | undefined;
    await act(async () => {
      tree = create(
        <I18nProvider>
          <ThemeProvider>
            <HomeQuickActions onUpload={jest.fn()} onWrite={jest.fn()} onResearch={jest.fn()} />
          </ThemeProvider>
        </I18nProvider>,
      );
    });
    const rendered = tree!;
    const getAction = (testID: string) => rendered.root.findAllByType(AnimatedPressable).find((node) => node.props.testID === testID);
    act(() => getAction('home-quick-action-dismiss-write')?.props.onPress());
    expect(getAction('home-quick-action-write')).toBeUndefined();
    expect(getAction('home-quick-action-upload')).toBeDefined();
    expect(getAction('home-quick-action-research')).toBeDefined();
  });
});
