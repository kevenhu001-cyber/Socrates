// Landing greeting text, published by ui/greeting.ts and read by the React
// Native hero (react/home/HomeEmptyState.tsx). The hero owns #topicTitle once
// it mounts, so legacy code must publish here instead of writing the node.

type Listener = () => void;

let greeting = '';
const listeners = new Set<Listener>();

export function getGreeting(): string {
  return greeting;
}

export function setGreeting(next: string): void {
  if (next === greeting) return;
  greeting = next;
  listeners.forEach((listener) => listener());
}

export function subscribeGreeting(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
