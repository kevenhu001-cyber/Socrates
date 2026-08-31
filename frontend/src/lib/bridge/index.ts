/**
 * Bridge module - barrel export for the immutable-bridge factory and
 * its React hooks. Existing callers (xxxStore.ts and legacyAdapter.ts
 * under src/react) keep their bespoke exports for M1; M2 will migrate
 * them to consume this module directly.
 *
 * Consumers
 *  - `createImmutableBridge` -> module-level singleton stores.
 *  - `useBridge` / `useBridgeSelector` -> React subscriptions.
 */

export {
  createImmutableBridge,
} from './createImmutableBridge.ts';

export type {
  ImmutableBridge,
  CreateImmutableBridgeOptions,
} from './createImmutableBridge.ts';

export { useBridge, useBridgeSelector } from './useBridge.ts';