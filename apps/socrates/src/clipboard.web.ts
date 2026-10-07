export async function copyText(text: string): Promise<void> {
  await globalThis.navigator.clipboard.writeText(text);
}
