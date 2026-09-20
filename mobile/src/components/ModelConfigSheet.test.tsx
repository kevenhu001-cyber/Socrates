import React from 'react';
import { Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ModelConfigSheet } from './ModelConfigSheet';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';
import type { ApiProvider } from '../data/api/client';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const PROVIDERS: ApiProvider[] = [
  { id: 'p-ext', label: 'OpenRouter', model: 'anthropic/claude-4', url: 'https://openrouter.ai', isBuiltIn: false } as never,
  { id: 'p-builtin', label: 'Beagle', model: 'luna-5.6', isBuiltIn: true } as never,
];

function renderSheet(props: Partial<React.ComponentProps<typeof ModelConfigSheet>> = {}) {
  return create(
    <I18nProvider>
      <ThemeProvider>
        <ModelConfigSheet
          visible
          providers={PROVIDERS}
          selectedId="p-builtin"
          effort="medium"
          onSelectModel={() => undefined}
          onChangeEffort={() => undefined}
          onClose={() => undefined}
          {...props}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe('ModelConfigSheet', () => {
  beforeEach(() => {
    /* Overlay animates with the native driver, which jest-expo lacks. */
    const noop = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    jest.spyOn(Animated, 'timing').mockReturnValue(noop as never);
    jest.spyOn(Animated, 'parallel').mockReturnValue(noop as never);
  });

  it('lists providers built-in first and marks the selected row', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderSheet(); });
    const rows = tree!.root.findAll(
      (node) => typeof node.props?.onPress === 'function'
        && (node.props?.accessibilityLabel === 'Beagle' || node.props?.accessibilityLabel === 'OpenRouter'),
    );
    /* AnimatedPressable replicates label/state onto nested nodes, so dedupe
     * while preserving row order. */
    const ordered = [...new Set(rows.map((node) => node.props.accessibilityLabel as string))];
    expect(ordered).toEqual(['Beagle', 'OpenRouter']); // built-in first
    expect(rows.find((node) => node.props.accessibilityLabel === 'Beagle')!.props.accessibilityState?.selected).toBe(true);
    expect(rows.find((node) => node.props.accessibilityLabel === 'OpenRouter')!.props.accessibilityState?.selected).toBe(false);
  });

  it('fires onSelectModel when a provider row is pressed', async () => {
    const onSelectModel = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderSheet({ onSelectModel }); });
    const row = tree!.root.find(
      (node) => node.props?.accessibilityLabel === 'OpenRouter' && typeof node.props?.onPress === 'function',
    );
    await act(async () => { row.props.onPress(); });
    expect(onSelectModel).toHaveBeenCalledWith('p-ext');
  });

  it('expands the intensity row inline and fires onChangeEffort', async () => {
    const onChangeEffort = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderSheet({ onChangeEffort }); });
    const toggle = tree!.root.find(
      (node) => node.props?.accessibilityLabel === 'Thinking intensity' && typeof node.props?.onPress === 'function',
    );
    await act(async () => { toggle.props.onPress(); });
    const high = tree!.root.find(
      (node) => node.props?.accessibilityLabel === 'High' && typeof node.props?.onPress === 'function',
    );
    await act(async () => { high.props.onPress(); });
    expect(onChangeEffort).toHaveBeenCalledWith('high');
    /* Expansion collapsed — no effort option buttons remain. */
    expect(
      tree!.root.findAll(
        (node) => node.props?.accessibilityLabel === 'Low' && typeof node.props?.onPress === 'function',
      ),
    ).toHaveLength(0);
  });

  it('closes via the Done button', async () => {
    const onClose = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderSheet({ onClose }); });
    const done = tree!.root.find(
      (node) => node.props?.accessibilityLabel === 'Done' && typeof node.props?.onPress === 'function',
    );
    await act(async () => { done.props.onPress(); });
    expect(onClose).toHaveBeenCalled();
  });
});
