const owners = new WeakMap<HTMLElement, string>();

export function hostIsMountedBy(host: HTMLElement | null, label: string): boolean {
  return !!host && owners.get(host) === label;
}

export function hostIsMounted(host: HTMLElement | null): boolean {
  return !!host && owners.has(host);
}

export function markHostMountedBy(host: HTMLElement, label: string): void {
  owners.set(host, label);
}

export function clearHostMounted(host: HTMLElement): void {
  owners.delete(host);
}
