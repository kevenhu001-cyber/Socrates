/* Re-export shim — TypeScript source lives in ./offline.ts. */
export {
  STREAM_TIMEOUT_MS,
  STREAM_HEARTBEAT_MS,
  STREAM_MAX_ATTEMPTS,
  STREAM_RETRY_DELAYS,
  STREAM_RETRYABLE_STATUS,
  makeAIWatchdog,
  offlineGuard,
  sleepBackoff,
} from './offline.ts';