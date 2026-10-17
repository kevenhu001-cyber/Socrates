/* Chat API facade: preserve stable imports while transport details live in
   focused request-body, probe, and provider modules under ./api/. */

import { callBuiltInAPI } from './api/builtIn.ts';
import { callCustomAPI } from './api/custom.ts';
import { setLastCallError } from './api/shared.ts';
import type { ChatRequestMessage } from './api/requestBody.ts';
import type { AIRequestOptions } from './retryPolicy.ts';
import type { ApiRequestOptions } from '../util/api.ts';
import type { ProviderConfig } from '../config/providerConfig.types.ts';

export { buildChatRequestBody } from './api/requestBody.ts';
export type { ChatRequestBody, ChatRequestMessage } from './api/requestBody.ts';
export { callAPIChat } from './api/probe.ts';

/** Provider bridge published by the legacy shell. */
interface ApiWindow {
  getActiveProvider: () => ProviderConfig | null;
  apiFetch: (path: string, opts?: ApiRequestOptions) => Promise<unknown>;
}

/* Route a non-streaming call by provider type. Each provider module owns its
   endpoint, response parsing, and retry cleanup. */
export async function callAPI(
  messages: ChatRequestMessage[],
  maxTokens: number,
  options?: AIRequestOptions,
): Promise<unknown> {
  /* The shell installs both bridges before any send path can run; the cast
     goes through `unknown` because they are not part of lib.dom's `Window`. */
  const win = window as unknown as ApiWindow;
  const retryOptions = Object.assign({}, options || {}, {
    source: (options && options.source) || 'chat',
  });
  const provider = win.getActiveProvider();
  if (!provider) {
    setLastCallError('no provider');
    return null;
  }

  setLastCallError(null);
  if (provider.isBuiltIn) return callBuiltInAPI(provider, messages, maxTokens, retryOptions);
  return callCustomAPI(win.apiFetch, messages, maxTokens, retryOptions);
}
