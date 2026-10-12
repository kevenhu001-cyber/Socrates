import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as SecureStore from 'expo-secure-store';
import { hideAppSplash } from '../native/appRuntime';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SplashReveal } from './SplashReveal';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../native/appRuntime', () => ({
  hideAppSplash: jest.fn().mockResolvedValue(undefined),
}));

const secureGet = SecureStore.getItemAsync as jest.Mock;
const hideSplash = hideAppSplash as jest.Mock;

describe('SplashReveal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('waits for fonts, first layout and persisted theme hydration before hiding the splash exactly once', async () => {
    let resolveTheme: (value: string | null) => void = () => undefined;
    const storedTheme = new Promise<string | null>((resolve) => { resolveTheme = resolve; });
    secureGet.mockImplementation((key: string) => (
      key === 'socrates.theme.preference' ? storedTheme : Promise.resolve(null)
    ));

    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <SplashReveal fontsLoaded={false}><Text>App</Text></SplashReveal>
        </ThemeProvider>,
      );
      await Promise.resolve();
    });

    const root = tree!.root.findByProps({ testID: 'app-root' });
    await act(async () => { root.props.onLayout({}); });
    expect(hideSplash).not.toHaveBeenCalled();

    await act(async () => {
      tree!.update(
        <ThemeProvider>
          <SplashReveal fontsLoaded><Text>App</Text></SplashReveal>
        </ThemeProvider>,
      );
    });
    expect(hideSplash).not.toHaveBeenCalled();

    await act(async () => {
      resolveTheme('light');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hideSplash).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.update(
        <ThemeProvider>
          <SplashReveal fontsLoaded><Text>App</Text></SplashReveal>
        </ThemeProvider>,
      );
    });
    expect(hideSplash).toHaveBeenCalledTimes(1);
  });
});
