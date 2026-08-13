import { Linking } from 'react-native';

export function parseLink(url: string) {
  try {
    const parsed = new URL(url);
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => { queryParams[key] = value; });
    return { queryParams };
  } catch {
    return { queryParams: {} as Record<string, string> };
  }
}

export function getInitialLink() {
  return Linking.getInitialURL();
}

export function subscribeToLinks(handler: (url: string) => void) {
  return Linking.addEventListener('url', ({ url }) => handler(url));
}
