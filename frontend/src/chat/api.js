/* Chat API facade: preserve stable imports while transport details live in
   focused request-body, probe, and provider modules under ./api/. */

import { callBuiltInAPI } from './api/builtIn.js';
import { callCustomAPI } from './api/custom.js';
import { setLastCallError } from './api/shared.js';

export { buildChatRequestBody } from './api/requestBody.js';
export { callAPIChat } from './api/probe.js';

/* Route a non-streaming call by provider type. Each provider module owns its
   endpoint, response parsing, and retry cleanup. */
export async function callAPI(messages, maxTokens, options) {
  const getActiveProvider = window.getActiveProvider;
  const apiFetch = window.apiFetch;
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
