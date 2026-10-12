import React from 'react';
import { Animated, LayoutAnimation, StyleSheet, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Composer, VoiceModeOverlay } from './Composer';
import { ThemeProvider } from '../theme/ThemeProvider';
import { I18nProvider } from '../i18n';

const mockUseReducedMotion = jest.fn<boolean | null, []>(() => null);
let mockIsCompact = true;
let mockWindowWidth = 390;

jest.mock('../native/reducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
  motionAllowed: (preference: boolean | null) => preference === false,
}));

jest.mock('../theme/responsive', () => ({
  useResponsive: () => ({ isCompact: mockIsCompact && mockWindowWidth <= 768 }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../native/voiceInput', () => ({
  useVoiceInput: () => ({
    status: 'idle',
    liveTranscript: '',
    elapsedSeconds: 0,
    volume: 0.16,
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
  }),
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

function composerElement() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <Composer
          value=""
          onChangeText={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
          onAttach={() => undefined}
        />
      </ThemeProvider>
    </I18nProvider>
  );
}

function renderComposer() {
  return create(composerElement());
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

describe('Composer focus layout', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(null);
    mockIsCompact = true;
    jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ locale: 'en-US' } as Intl.ResolvedDateTimeFormatOptions);
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    jest.spyOn(Animated, 'timing').mockReturnValue(animation as never);
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockIsCompact = true;
    mockWindowWidth = 390;
  });

  it('keeps the phone composer geometry and native input stable across focus and blur', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderComposer(); });
    const inputBefore = tree!.root.findByProps({ testID: 'composer-input' });
    const shell = tree!.root.findByProps({ testID: 'composer-shell' });
    const rail = tree!.root.findByProps({ testID: 'composer-tools-rail' });
    const inputGeometry = () => {
      const input = tree!.root.findByProps({ testID: 'composer-input' });
      const style = StyleSheet.flatten(input.props.style);
      const shellStyle = StyleSheet.flatten(shell.props.style);
      const railStyle = StyleSheet.flatten(rail.props.style);
      return {
        shellMinHeight: shellStyle.minHeight,
        editorHeight: style.height,
        editorPaddingTop: style.paddingTop,
        editorTextAlignVertical: style.textAlignVertical,
        railHeight: railStyle.height,
      };
    };
    const restingGeometry = inputGeometry();
    expect(restingGeometry.shellMinHeight).toBe(104);
    expect(restingGeometry.railHeight).toBe(48);
    expect(rail.props.accessibilityElementsHidden).toBe(false);

    await act(async () => { inputBefore.props.onFocus(); });
    const inputFocused = tree!.root.findByProps({ testID: 'composer-input' });
    expect(inputFocused).toBe(inputBefore);
    expect(inputGeometry()).toEqual(restingGeometry);

    await act(async () => { inputFocused.props.onBlur(); });
    const inputBlurred = tree!.root.findByProps({ testID: 'composer-input' });
    expect(inputBlurred).toBe(inputBefore);
    expect(inputGeometry()).toEqual(restingGeometry);
    expect(rail.props.accessibilityElementsHidden).toBe(false);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();
  });

  it('keeps the first wide focus transition static until the system preference resolves', async () => {
    mockIsCompact = false;
    mockUseReducedMotion.mockReturnValue(null);
    const timing = jest.spyOn(Animated, 'timing');
    let tree: ReturnType<typeof create> | null = null;

    await act(async () => { tree = renderComposer(); });
    const idleInput = tree!.root.findByType(TextInput);
    await act(async () => { idleInput.props.onFocus(); });

    // Focus is handled synchronously, but no optional motion starts while the
    // shared accessibility query is still pending.
    expect(tree!.root.findByProps({ testID: 'composer-input' })).toBeTruthy();
    expect(timing).not.toHaveBeenCalled();
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();

    mockUseReducedMotion.mockReturnValue(false);
    await act(async () => { tree!.update(composerElement()); });
    // Preference resolution must not replay the already-completed first focus.
    timing.mockClear();
    (LayoutAnimation.configureNext as jest.Mock).mockClear();

    const expandedInput = tree!.root.findByProps({ testID: 'composer-input' });
    await act(async () => { expandedInput.props.onBlur(); });
    const idleInputAgain = tree!.root.findByType(TextInput);
    await act(async () => { idleInputAgain.props.onFocus(); });

    // Once the preference is known to allow motion, a later transition may
    // animate normally; input focus itself was never delayed.
    expect(timing).toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'composer-input' })).toBeTruthy();
  });

  it.each([800, 1024])('keeps the same native input focused across the %idp layout transition', async (width) => {
    mockIsCompact = true;
    mockWindowWidth = width;
    mockUseReducedMotion.mockReturnValue(null);
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => { tree = renderComposer(); });

    const inputBefore = tree!.root.findByProps({ testID: 'composer-input' });
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(1);
    const nativeInputBefore = tree!.root.findByType(TextInput);
    await act(async () => { inputBefore.props.onFocus(); });
    expect(tree!.root.findByProps({ testID: 'composer-input' })).toBe(inputBefore);
    expect(tree!.root.findByType(TextInput)).toBe(nativeInputBefore);

    const geometryWhileFocused = StyleSheet.flatten(
      tree!.root.findByProps({ testID: 'composer-input' }).props.style,
    );
    expect(geometryWhileFocused.minHeight).toBe(40);
    expect(tree!.root.findByType(TextInput).props.multiline).toBe(true);

    await act(async () => { inputBefore.props.onBlur(); });
    expect(tree!.root.findByType(TextInput)).toBe(nativeInputBefore);
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(1);
  });
});
