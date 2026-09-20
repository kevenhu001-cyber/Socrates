import React from 'react';
import { act, create } from 'react-test-renderer';
import { VoiceModeOverlay } from './Composer';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

/* SafeAreaProvider's children never mount under jest-expo — stub the hook
 * instead so the overlay still exercises its real render path. */
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderOverlay(props: Partial<React.ComponentProps<typeof VoiceModeOverlay>> = {}) {
  return create(
    <I18nProvider>
      <ThemeProvider>
          <VoiceModeOverlay
            visible
            status="listening"
            transcript=""
            elapsedSeconds={3}
            volume={0.5}
            onCancel={() => undefined}
            onDone={() => undefined}
            {...props}
          />
        </ThemeProvider>
      </I18nProvider>,
  );
}

describe('VoiceModeOverlay', () => {
  beforeEach(() => {
    /* I18nProvider defaults to the device locale — pin English so the
     * label assertions hold on non-English hosts. */
    jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ locale: 'en-US' } as Intl.ResolvedDateTimeFormatOptions);
  });

  it('renders the orb surface with status, timer and both actions', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderOverlay(); });
    expect(tree!.root.findAll((n) => n.props?.testID === 'voice-mode-overlay').length).toBeGreaterThan(0);
    expect(tree!.root.findAll((n) => n.props?.children === 'Listening…').length).toBeGreaterThan(0);
    expect(tree!.root.findAll((n) => n.props?.children === '0:03').length).toBeGreaterThan(0);
    expect(
      tree!.root.find((n) => n.props?.accessibilityLabel === 'Done' && typeof n.props?.onPress === 'function'),
    ).toBeTruthy();
    expect(tree!.root.findAll((n) => n.props?.accessibilityLabel === 'Cancel').length).toBeGreaterThan(0);
  });

  it('shows the live transcript once speech arrives', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderOverlay({ transcript: 'draft reply', elapsedSeconds: 65 }); });
    expect(tree!.root.findAll((n) => n.props?.children === 'draft reply').length).toBeGreaterThan(0);
    expect(tree!.root.findAll((n) => n.props?.children === '1:05').length).toBeGreaterThan(0);
  });

  it('Done stops the session and Cancel discards it', async () => {
    const onDone = jest.fn();
    const onCancel = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderOverlay({ onDone, onCancel }); });
    const done = tree!.root.find(
      (n) => n.props?.accessibilityLabel === 'Done' && typeof n.props?.onPress === 'function',
    );
    await act(async () => { done.props.onPress(); });
    expect(onDone).toHaveBeenCalled();
    const close = tree!.root.find(
      (n) => n.props?.accessibilityLabel === 'Close' && typeof n.props?.onPress === 'function',
    );
    await act(async () => { close.props.onPress(); });
    expect(onCancel).toHaveBeenCalled();
  });
});
