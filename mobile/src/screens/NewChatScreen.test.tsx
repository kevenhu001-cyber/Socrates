import React from 'react';
import { Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';
import { appStore } from '../stores/appStore';
import { NewChatScreen } from './NewChatScreen';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

let mockIsFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockIsFocused,
}));

/* The reset-effect contract is what this spec covers; every child subtree is
 * stubbed so the render stays a pure store/focus interaction. */
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../components/Composer', () => ({ Composer: () => null }));
jest.mock('../components/ComposerToolsMenu', () => ({ ComposerToolsMenu: () => null }));
jest.mock('../components/ModelPickerModal', () => ({ ModelPickerModal: () => null }));
jest.mock('../data/chat/attachments', () => ({ pickChatAttachment: jest.fn() }));
jest.mock('../data/chat/prompts', () => ({
  MOBILE_EXTENSIONS: {},
  filterPromptTemplates: () => [],
  parseSlashQuery: () => null,
}));

const navigation = {
  navigate: jest.fn(),
  setParams: jest.fn(),
} as never;
const route = { params: {} } as never;

function renderScreen() {
  return create(
    <I18nProvider>
      <ThemeProvider>
        <NewChatScreen navigation={navigation} route={route} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe('NewChatScreen reset effect', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    /* jest-expo's renderer has no native animated module; the screen's
     * entrance animation would crash the test. Stub the drivers. */
    const noop = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    jest.spyOn(Animated, 'timing').mockReturnValue(noop as never);
    jest.spyOn(Animated, 'parallel').mockReturnValue(noop as never);
    mockIsFocused = true;
    (appStore as never as { setState: (p: object) => void }).setState({
      activeSession: null,
      authStatus: 'signedIn',
    });
  });

  it('starts a fresh draft session when the screen is focused', async () => {
    const spy = jest.spyOn(appStore, 'startNewSession');
    await act(async () => { renderScreen(); });
    expect(spy).toHaveBeenCalled();
  });

  it('does not reset the session while blurred, then resets on refocus', async () => {
    const spy = jest.spyOn(appStore, 'startNewSession');
    mockIsFocused = false;
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = renderScreen(); });
    expect(spy).not.toHaveBeenCalled();

    /* The reported bug: while Home is mounted but blurred, a session with
     * messages becomes active (e.g. opened from the drawer) and the effect
     * wiped it. With the focus guard it must survive. */
    (appStore as never as { setState: (p: object) => void }).setState({
      activeSession: {
        id: 's-1', topic: 't', mode: 'chat',
        messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      },
    });
    await act(async () => { tree!.update(
      <I18nProvider>
        <ThemeProvider>
          <NewChatScreen navigation={navigation} route={route} />
        </ThemeProvider>
      </I18nProvider>,
    ); });
    expect(spy).not.toHaveBeenCalled();
    expect(appStore.getSnapshot().activeSession?.id).toBe('s-1');

    /* Regained focus with a message-bearing session still resets — the
     * "navigate Home from a chat" path is unchanged. */
    mockIsFocused = true;
    await act(async () => { tree!.update(
      <I18nProvider>
        <ThemeProvider>
          <NewChatScreen navigation={navigation} route={route} />
        </ThemeProvider>
      </I18nProvider>,
    ); });
    expect(spy).toHaveBeenCalled();
  });

  it('does not reset when a session loads while Home is still focused', async () => {
    /* The drawer awaits appStore.openSession() before navigating to Chat,
     * so activeSession changes land while Home is focused. The reset must
     * be edge-triggered on focus, not on session data changes. */
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = renderScreen(); });
    const spy = jest.spyOn(appStore, 'startNewSession');
    (appStore as never as { setState: (p: object) => void }).setState({
      activeSession: {
        id: 's-1', topic: 't', mode: 'chat',
        messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      },
    });
    await act(async () => { tree!.update(
      <I18nProvider>
        <ThemeProvider>
          <NewChatScreen navigation={navigation} route={route} />
        </ThemeProvider>
      </I18nProvider>,
    ); });
    expect(spy).not.toHaveBeenCalled();
    expect(appStore.getSnapshot().activeSession?.id).toBe('s-1');
  });

  it('clears a projectId param that already matches the session project', async () => {
    /* projectId equal to the session's project is a no-op for the reset,
     * but the param must still be consumed or it leaks into the next
     * focus gain and triggers a stale reset. */
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = renderScreen(); });
    const spy = jest.spyOn(appStore, 'startNewSession');
    (appStore as never as { setState: (p: object) => void }).setState({
      activeSession: {
        id: 's-1', topic: 't', mode: 'chat', projectId: 'p-1',
        messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      },
    });
    const projectRoute = { params: { projectId: 'p-1' } } as never;
    await act(async () => { tree!.update(
      <I18nProvider>
        <ThemeProvider>
          <NewChatScreen navigation={navigation} route={projectRoute} />
        </ThemeProvider>
      </I18nProvider>,
    ); });
    expect(spy).not.toHaveBeenCalled();
    expect((navigation as { setParams: jest.Mock }).setParams).toHaveBeenCalledWith({ projectId: undefined });
  });
});
