import type { FetchLike } from '@socrates/api';
export const transportFetch: FetchLike = globalThis.fetch.bind(globalThis);
