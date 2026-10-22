/** Server-local monotonic milestones. Never attach prompt text or credentials. */
export function createChatTiming(now: () => number = () => performance.now()) {
  const startedAt = now();
  const milestones: Record<string, number> = {};
  return {
    mark(name: string): boolean {
      if (Object.hasOwn(milestones, name)) return false;
      milestones[name] = Math.max(0, now() - startedAt);
      return true;
    },
    snapshot(): Record<string, number> {
      return Object.fromEntries(Object.entries(milestones).map(([name, ms]) => [name, Math.round(ms)]));
    },
  };
}

export type ChatTiming = ReturnType<typeof createChatTiming>;
