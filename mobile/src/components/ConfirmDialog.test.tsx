import React from 'react';
import { act, create } from 'react-test-renderer';
import { ConfirmDialog } from './ConfirmDialog';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

/* 1:1 with `frontend/src/react/confirm/ConfirmDialog.tsx`: title +
 * message copy render, Cancel closes as cancel, OK/Delete resolves
 * as confirm. Covers the native port so the destructive flows that
 * migrate off `Alert.alert` stay wired. */
describe('ConfirmDialog', () => {
  it('renders title, message and both actions when visible', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <ConfirmDialog
            visible
            title="Delete conversation"
            message="Delete this conversation permanently?"
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </ThemeProvider>,
      );
    });
    const texts = tree!.root.findAllByType('Text' as never);
    const copy = texts.map((node) => (node.props as { children?: unknown }).children).flat().join('|');
    expect(copy).toContain('Delete conversation');
    expect(copy).toContain('Delete this conversation permanently?');
    expect(tree!.root.findByProps({ testID: 'confirm-ok' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'confirm-cancel' })).toBeTruthy();
  });

  it('routes confirm and cancel presses to their handlers', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <ConfirmDialog
            visible
            title="T"
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      tree!.root.findByProps({ testID: 'confirm-ok' }).props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => {
      tree!.root.findByProps({ testID: 'confirm-cancel' }).props.onPress();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
