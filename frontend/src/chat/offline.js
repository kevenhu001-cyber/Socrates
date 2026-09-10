/* Re-export shim — TypeScript source lives in ./offline.ts. */
export {
  STREAM_MAX_ATTEMPTS,
  STREAM_RETRY_DELAYS,
  STREAM_RETRYABLE_STATUS,
  offlineGuard,
  sleepBackoff,
} from './offline.ts';
