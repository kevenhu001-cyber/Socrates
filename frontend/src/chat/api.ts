/* Chat API facade: preserve stable imports while transport details live in
   focused request-body, probe, and provider modules under ./api/. */

import { callBuiltInAPI } from './api/builtIn.js';
import { callCustomAPI } from './api/custom.js';
import { setLastCallError } from './api/shared.ts';
import type { ChatRequestMessage } from './api/requestBody.ts';
import type { AIRequestOptions } from './retryPolicy.ts';
import type { ProviderConfig } from '../config/providerConfig.types.ts';

export { buildChatRequestBody } from './api/requestBody.ts';
export type { ChatRequestBody, ChatRequestMessage } from './api/requestBody.ts';
export { callAPIChat } from './api/probe.js';

/** Provider bridge published by the legacy shell. */
interface ApiWindow extends Window {
  getActiveProvider?: () => ProviderConfig | null;
  apiFetch?: (path: string, options?: Record<string, unknown>) => Promise<Response>;
}

/* Route a non-streaming call by provider type. Each provider module owns its
   endpoint, response parsing, and retry cleanup. */
export async function callAPI(
  messages: ChatRequestMessage[],
  maxTokens: number,
  options?: AIRequestOptions,
): Promise<unknown> {
  const win = window as ApiWindow;
  const getActiveProvider = win.getActiveProvider;
  const apiFetch = win.apiFetch;
  const retryOptions = Object.assign({}, options || {}, {
    source: (options && options.source) || 'chat',
  });
  const provider = typeof getActiveProvider === 'function' ? getActiveProvider() : null;
  if (!provider) {
    setLastCallError('no provider');
    return null;
  }

  setLastCallError(null);
  if (provider.isBuiltIn) return callBuiltInAPI(provider, messages, maxTokens, retryOptions);
  return callCustomAPI(apiFetch, messages, maxTokens, retryOptions);
}
