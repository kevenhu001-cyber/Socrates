import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { appStore, type AppState } from '../stores/appStore';
import { ChatScreen } from './ChatScreen';

const mockHeaderRender = jest.fn();

jest.mock('../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => jest.requireActual('react').createElement('Screen', null, children),
}));
jest.mock('../components/AppHeader', () => ({
  AppHeader: (props: Record<string, unknown>) => {
    mockHeaderRender(props);
    return null;
  },
}));
jest.mock('../components/AppDrawer', () => ({ useAppDrawer: () => ({ openDrawer: jest.fn() }) }));
jest.mock('../components/ModelPickerModal', () => ({ ModelPickerModal: () => null }));
jest.mock('../components/ModelConfigSheet', () => ({ ModelConfigSheet: () => null }));
jest.mock('./ChatTranscript', () => ({ ChatTranscript: () => jest.requireActual('react').createElement('ChatTranscript') }));
jest.mock('../components/Composer', () => ({ Composer: () => null }));
jest.mock('../components/ComposerToolsMenu', () => ({ ComposerToolsMenu: () => null }));
jest.mock('../components/AnimatedPressable', () => ({ AnimatedPressable: () => null }));
jest.mock('../components/ShareModal', () => ({ shareModal: { open: jest.fn() } }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff', border: '#ddd', surfaceRaised: '#fafafa', text: '#111',
      textMuted: '#666', accent: '#3584ff', accentSoft: '#eef5ff', danger: '#d00',
    },
    radius: { sm: 8, md: 12 },
    typography: { body: 'body', medium: 'medium', semibold: 'semibold' },
    spacing: { md: 12, lg: 16 },
  }),
}));
jest.mock('../i18n', () => ({ useT: () => (key: string) => key }));
jest.mock('../native/native', () => ({ native: { vibrate: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../data/chat/attachments', () => ({ pickChatAttachment: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({ children }: { children: React.ReactNode }) => jest.requireActual('react').createElement(jest.requireActual('react-native').View, null, children),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

type StoreInternals = { setState: (patch: Partial<AppState>) => void };
const store = appStore as unknown as StoreInternals;

function props(): React.ComponentProps<typeof ChatScreen> {
  return {
    navigation: { navigate: jest.fn() },
    route: {},
  } as unknown as React.ComponentProps<typeof ChatScreen>;
}

describe('ChatScreen subscription and mount lifecycle', () => {
  let previous: AppState;
  let tree: ReactTestRenderer | null;

  beforeEach(() => {
    previous = appStore.getSnapshot();
    tree = null;
    mockHeaderRender.mockClear();
    store.setState({
      activeSession: {
        id: 'screen-perf',
        title: 'Stable title',
        mode: 'chat',
        messages: [],
      } as unknown as AppState['activeSession'],
      isOnline: true,
      isIncognito: false,
      isStreaming: false,
      error: null,
    });
    mockHeaderRender.mockClear();
  });

  afterEach(() => {
    if (tree) act(() => tree?.unmount());
    tree = null;
    act(() => store.setState(previous));
  });

  it('does not render screen chrome on message frames, but reacts to title changes', () => {
    act(() => { tree = create(<ChatScreen {...props()} />); });
    expect(mockHeaderRender).toHaveBeenCalledTimes(1);

    act(() => {
      const session = appStore.getSnapshot().activeSession!;
      store.setState({
        activeSession: {
          ...session,
          messages: [{ id: 'a1', clientId: 'a1', role: 'assistant', type: 'streaming', rawText: 'first', content: 'first' }],
        } as unknown as AppState['activeSession'],
      });
    });
    expect(mockHeaderRender).toHaveBeenCalledTimes(1);

    act(() => {
      const session = appStore.getSnapshot().activeSession!;
      store.setState({ activeSession: { ...session, title: 'Updated title' } as unknown as AppState['activeSession'] });
    });
    expect(mockHeaderRender).toHaveBeenCalledTimes(2);
    expect(mockHeaderRender.mock.calls.at(-1)?.[0].title).toBe('Updated title');
  });

  it('unmounts/remounts one header instance without retaining the prior tree', () => {
    act(() => { tree = create(<ChatScreen {...props()} />); });
    expect(mockHeaderRender).toHaveBeenCalledTimes(1);
    act(() => tree?.unmount());
    tree = null;
    mockHeaderRender.mockClear();

    act(() => { tree = create(<ChatScreen {...props()} />); });
    expect(mockHeaderRender).toHaveBeenCalledTimes(1);
  });
});
