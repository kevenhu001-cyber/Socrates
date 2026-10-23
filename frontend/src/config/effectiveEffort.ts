import type { ProviderCapabilities } from '@socrates/contracts';
import type { ReasoningEffort } from './chatPreferences.ts';

/**
 * The `reasoning_effort` value to put on the wire, or undefined when the
 * model takes no effort parameter at all.
 */
export type EffortRequest = 'none' | 'low' | 'medium' | 'high' | undefined;

/**
 * The effort the selected model can actually honour.
 *
 * The server resolves the same capabilities against the real model (see
 * server/src/lib/modelCapabilities.ts). The browser has to agree with it:
 *
 *   - a stored "Instant" that the active model cannot satisfy would make
 *     every turn fail with a capability error;
 *   - a stored level that the model ignores is a promise the app cannot
 *     keep, because the picker would show a level the request never sends.
 *
 * An absent summary means "nothing is known" — the intent is forwarded as
 * it is and the server decides, exactly as before this field existed. Only
 * an explicit "no" changes what the browser sends.
 */
export function resolveEffortRequest(
  effort: ReasoningEffort,
  capabilities?: ProviderCapabilities | null,
): EffortRequest {
  if (!capabilities) return effort === 'instant' ? 'none' : effort;
  if (effort === 'instant') {
    if (capabilities.supportsInstant === false) {
      /* Instant is impossible for this model. Low is the closest level the
         app has; a model without effort levels takes no parameter at all. */
      return capabilities.supportsEffort === false ? undefined : 'low';
    }
    return 'none';
  }
  return capabilities.supportsEffort === false ? undefined : effort;
}

/**
 * The effort the UI shows for the active model.
 *
 * Same rule as the wire: a preference the model cannot satisfy is shown as
 * the level that is actually in effect, so the picker never claims Instant
 * while the request asks for something else. The stored preference is left
 * alone — switching back to a model that supports Instant restores it.
 */
export function resolveEffectiveEffort(
  effort: ReasoningEffort,
  capabilities?: ProviderCapabilities | null,
): ReasoningEffort {
  if (!capabilities) return effort;
  if (effort === 'instant' && capabilities.supportsInstant === false) {
    return capabilities.supportsEffort === false ? 'medium' : 'low';
  }
  return effort;
}
