import React from 'react';
import { act, create } from 'react-test-renderer';
import { ShareModal, closeShare, openShare } from './ShareModal';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

/* Share is a modal (frontend `.share-modal`), not a route: opening with
 * a payload mounts the card, closing unmounts it. */
describe('ShareModal', () => {
  it('mounts on open with the link and unmounts on close', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <ShareModal />
        </ThemeProvider>,
      );
    });
    expect(tree!.root.findAllByProps({ testID: 'share-modal' })).toHaveLength(0);

    await act(async () => {
      openShare({ url: 'https://example.com/s/abc', title: 'Conversation' });
    });
    // testID propagates through animated wrappers, so match existence,
    // not exact count.
    expect(tree!.root.findAllByProps({ testID: 'share-modal' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ testID: 'share-copy' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ testID: 'share-native' }).length).toBeGreaterThan(0);

    await act(async () => {
      tree!.root.findAllByProps({ testID: 'share-close' })[0].props.onPress();
    });
    expect(tree!.root.findAllByProps({ testID: 'share-modal' })).toHaveLength(0);

    closeShare();
  });
});
