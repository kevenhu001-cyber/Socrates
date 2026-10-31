/* Chat API facade: preserve stable imports while transport details live in
   focused request-body, probe, and provider modules under ./api/. */

import { callBuiltInAPI } from './api/builtIn.ts';
import { callCustomAPI } from './api/custom.ts';
import { setLastCallError } from './api/shared.ts';
import { getActiveProvider } from '../config/providerConfig.service.ts';
import { apiFetch } from '../util/api.ts';
import type { ChatRequestMessage } from './api/requestBody.ts';
import type { AIRequestOptions } from './retryPolicy.ts';

export { buildChatRequestBody } from './api/requestBody.ts';
export type { ChatRequestBody, ChatRequestMessage } from './api/requestBody.ts';
export { callAPIChat } from './api/probe.ts';

/* Route a non-streaming call by provider type. Each provider module owns its
   endpoint, response parsing, and retry cleanup. */
export async function callAPI(
  messages: ChatRequestMessage[],
  maxTokens: number,
  options?: AIRequestOptions,
): Promise<unknown> {
  const retryOptions = Object.assign({}, options || {}, {
    source: (options && options.source) || 'chat',
  });
  const provider = getActiveProvider();
  if (!provider) {
    setLastCallError('no provider');
    return null;
  }

  setLastCallError(null);
  if (provider.isBuiltIn) return callBuiltInAPI(provider, messages, maxTokens, retryOptions);
  return callCustomAPI(apiFetch, messages, maxTokens, retryOptions);
}
