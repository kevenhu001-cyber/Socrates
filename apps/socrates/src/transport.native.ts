import { fetch } from 'expo/fetch';
import type { FetchLike } from '@socrates/api';
// RN global fetch buffers through XHR; expo/fetch exposes a streaming body.
export const transportFetch: FetchLike = fetch;
