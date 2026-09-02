/**
 * Public surface of `@socrates/theme`.
 *
 * Usage:
 *   import { spacing, palettesHex, getThemePalette } from '@socrates/theme';
 *
 * `tokens.ts` re-exports the canonical source mirrored from
 * `frontend/src/ui/tokens.ts`. `rn.ts` adds RN-native helpers that
 * resolve HSL triplets to hex strings for StyleSheet consumers.
 */

export * from './tokens';
export * from './rn';
