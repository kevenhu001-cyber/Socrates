import React from 'react';
import { FlatList } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Message } from '@socrates/contracts';
import { appStore, type AppState } from '../stores/appStore';
import { ChatTranscript } from './ChatTranscript';

jest.mock('../components/MessageBubble', () => ({ MessageBubble: () => null }));
jest.mock('../components/AnimatedPressable', () => ({ AnimatedPressable: () => null }));
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff', border: '#ddd', surfaceRaised: '#fafafa', text: '#111',
      textMuted: '#666', accent: '#3584ff', accentSoft: '#eef5ff', danger: '#d00',
    },
    spacing: { lg: 16 },
    typography: { body: 'body', medium: 'medium' },
  }),
}));
jest.mock('../theme/theme', () => ({ withAlpha: (color: string) => color }));
jest.mock('../i18n', () => ({ useT: () => (key: string) => key }));

type StoreInternals = { setState: (patch: Partial<AppState>) => void };
const store = appStore as unknown as StoreInternals;
const noSearch = {
  searchActive: false,
  searchQuery: '',
  searchMatchIndex: 0,
  setSearchActive: jest.fn(),
  setSearchQuery: jest.fn(),
  setSearchMatchIndex: jest.fn(),
};

function assistant(text: string): Message {
  return { id: 'assistant-1', clientId: 'assistant-1', role: 'assistant', type: 'streaming', rawText: text, content: text } as Message;
}

function user(text: string): Message {
  return { id: 'user-1', clientId: 'user-1', role: 'user', type: 'user', rawText: text, content: text } as Message;
}

describe('ChatTranscript stable row identity', () => {
  let previous: AppState;
  let tree: ReactTestRenderer | null;
  const stickToBottom = { current: true };
  const animateNextMessage = { current: false };

  beforeEach(() => {
    previous = appStore.getSnapshot();
    tree = null;
    stickToBottom.current = true;
    animateNextMessage.current = false;
    store.setState({
      activeSession: { id: 'transcript-test', messages: [assistant('old')] } as unknown as AppState['activeSession'],
      linkPreviews: {},
    });
  });

  afterEach(() => {
    if (tree) act(() => tree?.unmount());
    tree = null;
    act(() => store.setState(previous));
  });

  function renderTranscript() {
    return create(
      <ChatTranscript
        {...noSearch}
        stickToBottom={stickToBottom}
        animateNextMessage={animateNextMessage}
      />,
    );
  }

  function list() {
    return tree!.root.findByType(FlatList);
  }

  it('keeps historical rows static and preserves the same key across streamed content updates', () => {
    act(() => { tree = renderTranscript(); });
    const originalMessage = assistant('old');
    const originalKey = list().props.keyExtractor(originalMessage, 0);
    const originalRow = list().props.renderItem({ item: originalMessage, index: 0 });
    expect(originalRow.props.animateEntrance).toBe(false);

    act(() => {
      const session = appStore.getSnapshot().activeSession!;
      store.setState({
        activeSession: { ...session, messages: [assistant('old text + delta')] } as unknown as AppState['activeSession'],
      });
    });

    const streamedMessage = assistant('old text + delta');
    expect(list().props.keyExtractor(streamedMessage, 0)).toBe(originalKey);
    const streamedRow = list().props.renderItem({ item: streamedMessage, index: 0 });
    expect(streamedRow.props.animateEntrance).toBe(false);
  });

  it('animates the newly sent row once, then does not replay on subsequent stream frames', () => {
    act(() => { tree = renderTranscript(); });
    animateNextMessage.current = true;
    act(() => {
      const session = appStore.getSnapshot().activeSession!;
      store.setState({
        activeSession: { ...session, messages: [assistant('old'), user('hello')] } as unknown as AppState['activeSession'],
      });
    });

    const firstUserFrame = list().props.renderItem({ item: user('hello'), index: 1 });
    expect(firstUserFrame.props.animateEntrance).toBe(true);
    expect(animateNextMessage.current).toBe(false);

    act(() => {
      const session = appStore.getSnapshot().activeSession!;
      store.setState({
        activeSession: { ...session, messages: [assistant('old'), user('hello world')] } as unknown as AppState['activeSession'],
      });
    });
    const nextFrame = list().props.renderItem({ item: user('hello world'), index: 1 });
    expect(nextFrame.props.animateEntrance).toBe(false);
    expect(list().props.keyExtractor(user('hello world'), 1)).toBe('user-1');
  });
});
