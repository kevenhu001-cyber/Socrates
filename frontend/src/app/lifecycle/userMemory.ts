/* Cached user memories are shared by auth cleanup and prompt construction. */
let userMemories: string[] = [];

export function getUserMemories(): string[] {
  return userMemories;
}

export function setUserMemories(memories: string[]): void {
  userMemories = memories;
}

export function clearUserMemories(): void {
  userMemories = [];
}
