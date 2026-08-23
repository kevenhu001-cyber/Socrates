import { ALL_SCOPES } from '../middleware/scopes.js';

/* Canonical externally-visible URLs for the Phase D OAuth 2.0 authorization
 * server. Single source of truth consumed by the /api/oauth routes, the
 * RFC 8414 discovery handlers, the WWW-Authenticate challenge, and the
 * hand-authored openapi.json. Override OAUTH_PUBLIC_ORIGIN only when serving
 * the API behind a different host than production nginx. */
export const OAUTH_PUBLIC_ORIGIN = process.env.OAUTH_PUBLIC_ORIGIN || 'https://app.topodrive.top';

/* RFC 9728 protected-resource metadata URL — advertised inside every
 * WWW-Authenticate challenge so an agent learns the full auth chain from a
 * single 401 (WorkOS auth-md spec: resource_metadata parameter). */
export const OAUTH_PROTECTED_RESOURCE_METADATA_URL = 'https://topodrive.top/.well-known/oauth-protected-resource';
export const AUTH_MD_URL = 'https://topodrive.top/auth.md';

export const OAUTH_ISSUER = `${OAUTH_PUBLIC_ORIGIN}/api/oauth`;
export const OAUTH_AUTHORIZATION_ENDPOINT = `${OAUTH_PUBLIC_ORIGIN}/api/oauth/authorize`;
export const OAUTH_TOKEN_ENDPOINT = `${OAUTH_PUBLIC_ORIGIN}/api/oauth/token`;
export const OAUTH_REVOCATION_ENDPOINT = `${OAUTH_PUBLIC_ORIGIN}/api/oauth/revoke`;

/* RFC 6750 §3 challenge prefix. Callers append error= / scope= params.
 * resource_metadata is always included: it is the machine-discoverable
 * pointer agents use to resolve the rest of the auth chain. */
export function wwwAuthenticateChallenge(extra?: Record<string, string>): string {
  const parts = [`Bearer realm="socrates"`];
  parts.push(`resource_metadata="${OAUTH_PROTECTED_RESOURCE_METADATA_URL}"`);
  if (extra?.authorizationUri) parts.push(`authorization_uri="${extra.authorizationUri}"`);
  if (extra?.error) parts.push(`error="${extra.error}"`);
  if (extra?.errorDescription) parts.push(`error_description="${extra.errorDescription}"`);
  if (extra?.scope) parts.push(`scope="${extra.scope}"`);
  return parts.join(', ');
}

/** RFC 8414 §2 server metadata document, extended with the WorkOS
 * auth-md `agent_auth` discovery block so agents can find the registration
 * and revocation endpoints without reading prose. */
export function buildAuthorizationServerMetadata(): Record<string, unknown> {
  return {
    issuer: OAUTH_ISSUER,
    authorization_endpoint: OAUTH_AUTHORIZATION_ENDPOINT,
    token_endpoint: OAUTH_TOKEN_ENDPOINT,
    revocation_endpoint: OAUTH_REVOCATION_ENDPOINT,
    registration_endpoint: `${OAUTH_ISSUER}/register`,
    scopes_supported: [...ALL_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    authorization_response_iss_parameter_supported: true,
    service_documentation: AUTH_MD_URL,
    agent_auth: {
      register_uri: `${OAUTH_ISSUER}/register`,
      revocation_uri: OAUTH_REVOCATION_ENDPOINT,
      identity_types_supported: ['anonymous'],
      anonymous: {
        credential_types_supported: ['oauth_client_credentials'],
      },
      identity_assertion: {
        assertion_types_supported: [
          'verified_email',
          'urn:ietf:params:oauth:token-type:id-jag',
        ],
        credential_types_supported: ['jwt_vc', 'id_token'],
        _note:
          'Reserved for future use. Anonymous (oauth_client_credentials) is the only identity type currently issued. When identity_assertion ships, agents will be able to present a verified_email assertion or an id-jag to upgrade their anonymous registration.',
      },
      skill: AUTH_MD_URL,
    },
  };
}
