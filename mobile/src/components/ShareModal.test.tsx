import React from 'react';
import { act, create } from 'react-test-renderer';
import { ShareModal, closeShare, openShare } from './ShareModal';
import { ThemeProvider } from '../theme/ThemeProvider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockCreate = jest.fn();
const mockRevoke = jest.fn();
jest.mock('../data/api/client', () => ({
  sharesApi: {
    get: jest.fn(),
    create: (...args: unknown[]) => mockCreate(...args),
    revoke: (...args: unknown[]) => mockRevoke(...args),
    absoluteUrl: (url: string) => `https://socrates.example/${url.replace(/^\/+/, '')}`,
  },
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

  it('creates a link with the selected visibility and revokes it', async () => {
    mockCreate.mockResolvedValue({ token: 'tok123', url: '/a/tok123', visibility: 'private' });
    mockRevoke.mockResolvedValue(null);

    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <ShareModal />
        </ThemeProvider>,
      );
    });

    await act(async () => {
      openShare({ sessionId: 'sess-1', title: 'Conversation' });
    });

    // Radio group renders both visibility options; create starts hidden-state.
    expect(tree!.root.findAllByProps({ testID: 'share-vis-public' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ testID: 'share-vis-private' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ testID: 'share-copy' })).toHaveLength(0);

    // Pick private, then create. testID also lands on the animated
    // wrapper, so find the node that actually carries onPress.
    const press = (testID: string) => (
      tree!.root.findAllByProps({ testID }).find((n) => typeof n.props.onPress === 'function')!
    );
    await act(async () => {
      press('share-vis-private').props.onPress();
    });
    await act(async () => {
      press('share-create').props.onPress();
    });
    expect(mockCreate).toHaveBeenCalledWith('sess-1', 'private');

    // Link row + revoke appear once the token resolves.
    expect(tree!.root.findAllByProps({ testID: 'share-copy' }).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({ testID: 'share-revoke' }).length).toBeGreaterThan(0);

    await act(async () => {
      press('share-revoke').props.onPress();
    });
    expect(mockRevoke).toHaveBeenCalledWith('sess-1');
    expect(tree!.root.findAllByProps({ testID: 'share-copy' })).toHaveLength(0);

    await act(async () => {
      closeShare();
    });
  });
});
