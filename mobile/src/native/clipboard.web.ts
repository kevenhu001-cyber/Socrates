export async function setClipboardText(value: string) {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) await clipboard.writeText(value);
}
