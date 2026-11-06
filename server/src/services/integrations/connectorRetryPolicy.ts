const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429]);
const NON_RETRYABLE_SERVER_STATUSES = new Set([501, 505]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const RETRYABLE_CONNECTOR_CODES = new Set([
  'client_network_error',
  'client_timeout',
  'proxy_upstream_timeout',
  'rate_limited',
  'request_in_progress',
]);

/** Statuses that may recover without changing credentials or arguments. */
export function isRetryableConnectorStatus(value: unknown): boolean {
  const status = Number(value);
  if (!Number.isInteger(status)) return false;
  return RETRYABLE_HTTP_STATUSES.has(status)
    || (status >= 500 && status <= 599 && !NON_RETRYABLE_SERVER_STATUSES.has(status));
}

/**
 * Unknown failures are not retried automatically. Retry only when a provider
 * supplies a transient HTTP status, a known transport code, or an explicit
 * classification.
 */
export function isRetryableConnectorFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    retryable?: unknown;
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    name?: unknown;
    cause?: { code?: unknown; name?: unknown } | null;
  };
  if ([record.name, record.cause?.name].some((name) => name === 'AbortError')) return false;
  if (typeof record.retryable === 'boolean') return record.retryable;
  if (typeof record.code === 'string' && RETRYABLE_CONNECTOR_CODES.has(record.code)) return true;

  const status = record.status ?? record.statusCode;
  const numericStatus = Number(status);
  if (status !== undefined && status !== null && Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus <= 599) {
    return isRetryableConnectorStatus(numericStatus);
  }

  if ([record.name, record.cause?.name].some((name) => name === 'TimeoutError')) {
    return true;
  }
  return [record.code, record.cause?.code].some((code) => (
    typeof code === 'string'
    && (RETRYABLE_NETWORK_CODES.has(code) || RETRYABLE_CONNECTOR_CODES.has(code))
  ));
}

/** Preserve an upstream HTTP status on errors caught by connector tools. */
export function connectorHttpError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}
