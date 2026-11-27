let mount: (() => void) | undefined;
let requested = false;

/** Authentication can reveal the shell before asynchronous bootstrap installs its mounts. */
export function requestReactCompatibilityMount(): void {
  if (mount) mount();
  else requested = true;
}

export function registerReactCompatibilityMount(callback: () => void): void {
  mount = callback;
  if (!requested) return;
  requested = false;
  mount();
}
