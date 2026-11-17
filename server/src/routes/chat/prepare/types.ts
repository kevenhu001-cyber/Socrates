import type { getActiveApiKey } from '../../../services/core/apiKey.js';

/** The decrypted LLM provider returned by services/core/apiKey.js. */
export type Provider = NonNullable<Awaited<ReturnType<typeof getActiveApiKey>>>;
