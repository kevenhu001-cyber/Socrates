/* One reviewed OpenConnector action exposed to the model.
 * Split out so the catalog data modules share a single declaration. */

export interface OpenConnectorChatTool {
  tool: string;
  service: string;
  actionId: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Some actions have non-idempotent side effects and must never be retried automatically. */
  retryableOnTransientError?: boolean;
}
