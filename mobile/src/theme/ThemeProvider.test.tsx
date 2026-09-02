import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ThemeProvider, useTheme, useThemeController } from './ThemeProvider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

/* Regression coverage for the launch crash: ThemeProvider wraps the whole app,
 * and it used to call `StatusBar.setStatusBarStyle` on React Native's StatusBar,
 * which has no such method. The mount effect threw and every launch died before
 * a single screen rendered. These tests fail if that ever regresses. */
describe('ThemeProvider', () => {
  it('mounts without throwing', async () => {
    let tree: ReturnType<typeof create> | null = null;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <Text>ready</Text>
        </ThemeProvider>,
      );
    });
    expect(tree).not.toBeNull();
  });

  it('exposes a usable theme to consumers', async () => {
    const seen: string[] = [];
    function Probe() {
      const theme = useTheme();
      seen.push(theme.colors.background);
      return <Text>{theme.mode}</Text>;
    }
    await act(async () => {
      create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toMatch(/^#/);
  });

  it('supports setting theme preference between light, dark, and system', async () => {
    let controller: ReturnType<typeof useThemeController> | null = null;
    function Probe() {
      controller = useThemeController();
      return <Text>{controller.mode}</Text>;
    }
    await act(async () => {
      create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      await controller!.setPreference('light');
    });
    expect(controller!.mode).toBe('light');
    expect(controller!.preference).toBe('light');
    await act(async () => {
      await controller!.setPreference('dark');
    });
    expect(controller!.mode).toBe('dark');
    expect(controller!.preference).toBe('dark');
  });
});
