import type { ActionEvent } from '@openuidev/react-lang';
import { webUrl } from './style';

/** Explicit host bridge: local @Set/@Reset stay inside the OpenUI runtime. */
export function runOpenUiAction(event: ActionEvent, host: HTMLElement | null, readOnly: boolean): void {
  if (event.type === 'open_url') {
    const href = webUrl(event.params.url);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  if (readOnly || !host || event.type !== 'continue_conversation') return;
  const text = typeof event.params.context === 'string' ? event.params.context : event.humanFriendlyMessage;
  if (!text?.trim()) return;
  const form = event.formState && Object.keys(event.formState).length ? `\n\n${JSON.stringify(event.formState)}` : '';
  host.dispatchEvent(new CustomEvent('tool-retry', {
    bubbles: true,
    detail: { tool: 'intelligent_ui', prompt: `${text.trim()}${form}` },
  }));
}
