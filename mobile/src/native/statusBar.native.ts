import { setStatusBarStyle } from 'expo-status-bar';

export function setAppStatusBarStyle(style: 'light' | 'dark', animated = true) {
  setStatusBarStyle(style, animated);
}
