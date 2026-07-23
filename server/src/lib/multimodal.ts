/**
 * Multimodal (vision-capable) provider check.
 *
 * The chat schema accepts `image_url` content parts, but only
 * providers the user has marked as multimodal can actually consume
 * them. Before forwarding a multimodal payload we read the
 * `isMultimodal` flag directly off the active provider (decrypted
 * by `services/apiKey.js` from the `api_keys.is_multimodal`
 * column). If the flag is false, `routes/chat.js` replaces each
 * image_url part with a textual placeholder so:
 *   - the user gets a sensible "I can't view this" reply instead of
 *     a confusing upstream 400;
 *   - we don't waste tokens shipping a 500 KB base64 payload to a
 *     model that can't read it;
 *   - the user's parsed text / PDF contents still reach the model.
 *
 * Earlier revisions maintained a regex allow-list of vision-capable
 * model names here; that has been replaced by the user-controlled
 * flag so:
 *   - Users with custom OpenAI-compatible proxies pointing at a
 *     bespoke vision model can opt in without server code changes.
 *   - We never need to update the pattern list when a new model
 *     launches.
 *   - Built-in Beagle is forced true by the seeder; the flag is
 *     the single source of truth.
 */

/**
 * Decide whether `provider` advertises multimodal (image-in / image-out)
 * capability. Used by `routes/chat.js` to decide whether to forward
 * `image_url` content parts verbatim.
 *
 * @param {object|null|undefined} provider — the decrypted provider
 *   shape returned by `services/apiKey.js#decryptProvider`. Must carry
 *   `isMultimodal: boolean`. Anything else (missing / null / wrong
 *   shape) is treated as text-only.
 * @returns {boolean}
 */
export function isMultimodalProvider(provider: unknown): boolean {
  if (!provider || typeof provider !== 'object') return false;
  return (provider as { isMultimodal?: unknown }).isMultimodal === true;
}
