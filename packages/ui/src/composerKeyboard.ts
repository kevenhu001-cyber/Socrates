/** DOM-free keyboard contract; native/mobile multiline Enter remains a newline. */
export function shouldSubmitComposerKey(event: {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}, desktopWeb: boolean): boolean {
  return desktopWeb && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}
