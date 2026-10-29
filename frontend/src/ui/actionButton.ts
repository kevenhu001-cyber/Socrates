import type { ActionButtonProps } from '../react/legacy-controls/ActionButton';
import { reportSwallow } from '../util/reportSwallow.ts';

const requests = new WeakMap<HTMLElement, number>();

/** Keep low-frequency legacy action surfaces out of the initial React chunk. */
export function renderActionButton(host: HTMLElement, props: ActionButtonProps): void {
  const request = (requests.get(host) || 0) + 1;
  requests.set(host, request);
  void import('../react/legacy-controls/actionButtonHost.tsx').then(({ renderActionButton: render }) => {
    if (!host.isConnected || requests.get(host) !== request) return;
    render(host, props);
  }).catch((error) => reportSwallow(error, 'ui/actionButton:render'));
}
