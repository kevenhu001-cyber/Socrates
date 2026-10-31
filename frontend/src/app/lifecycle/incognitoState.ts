let incognito = false;
const listeners = new Set<() => void>();

export function isIncognitoOn(): boolean {
  return incognito;
}

export function setIncognitoOn(value: boolean): void {
  if (incognito === value) return;
  incognito = value;
  listeners.forEach((listener) => listener());
}

export function subscribeIncognito(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
