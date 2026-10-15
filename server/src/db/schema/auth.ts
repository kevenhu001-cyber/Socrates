import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────────────────────────
   Users
   ────────────────────────────────────────────── */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  tier: text('tier').notNull().default('diophantus'),  // diophantus | riemann | descartes | euclid
  plan: text('plan'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  isGuest: boolean('is_guest').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  customInstructions: text('custom_instructions'),
  defaultModel: text('default_model'),
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('users_email_idx').on(table.email)]);

/* ──────────────────────────────────────────────
   Auth sessions (sid cookie → user mapping)
   ────────────────────────────────────────────── */
export const authSessions = pgTable('auth_sessions', {
  token: text('token').primaryKey(),       // 64-char hex (sid cookie value)
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('auth_sessions_user_id_idx').on(table.userId),
  index('auth_sessions_expires_at_idx').on(table.expiresAt),
]);

/* ──────────────────────────────────────────────
   Pending registrations (account not created until email verified)
   ────────────────────────────────────────────── */
export const pendingRegistrations = pgTable('pending_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pending_registrations_token_idx').on(table.token),
  index('pending_registrations_email_idx').on(table.email),
]);

/* ──────────────────────────────────────────────
   Verification tokens (email verify, password reset)
   ────────────────────────────────────────────── */
export const verificationTokens = pgTable('verification_tokens', {
  token: text('token').primaryKey(),        // 16-char hex
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),             // email_verify | password_reset
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('verification_tokens_user_id_idx').on(table.userId),
  index('verification_tokens_kind_idx').on(table.kind),
]);

/* ──────────────────────────────────────────────
   API Keys / Providers
   ────────────────────────────────────────────── */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  model: text('model').notNull(),
  keyCiphertext: text('key_ciphertext'),    // AES-256-GCM encrypted
  keyHint: text('key_hint'),                // First 8 chars for UI display
  isActive: boolean('is_active').notNull().default(false),
  isBuiltIn: boolean('is_built_in').notNull().default(false),
  /* P_attachments-multimodal — user-controlled flag marking this
   * provider as vision-capable. Replaces the previous regex-based
   * detection in lib/multimodal.js. Built-in Beagle rows are seeded
   * with true; custom providers default to false and the user opts
   * in via the API key editor. */
  isMultimodal: boolean('is_multimodal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('api_keys_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   Audit Events — user action log
   Tracks who did what and when. Insert-only;
   records are never updated or deleted.
   ────────────────────────────────────────────── */
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),         // register | login | logout | chat | create_api_key | delete_api_key | etc.
  detail: jsonb('detail').default({}),       // request-specific metadata
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_events_user_id_idx').on(table.userId),
  index('audit_events_created_at_idx').on(table.createdAt),
  index('audit_events_action_idx').on(table.action),
]);

/* ──────────────────────────────────────────────
   Login Failures — per-email brute-force tracking
   Persists failure counts and lockout timestamps so
   the lockout is process-global (safe under
   multi-worker / cluster deployments).
   One row per email; UPSERTed on each failure.
   ────────────────────────────────────────────── */
export const loginFailures = pgTable('login_failures', {
  email: text('email').primaryKey(),        // lowercased email
  count: integer('count').notNull().default(0),
  firstAt: timestamp('first_at', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
}, (table) => [
  index('login_failures_locked_until_idx').on(table.lockedUntil),
]);

/* ──────────────────────────────────────────────
   Agent API keys (Phase D) — long-lived scoped credentials for headless agents.
   The plaintext secret is shown exactly once at creation; only the SHA-256 of
   "<keyId>.<secret>" is persisted. keyId is public (it prefixes the bearer).
   ────────────────────────────────────────────── */
export const agentApiKeys = pgTable('agent_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /* SHA-256 of "<keyId>.<secret>" — never store the plaintext secret. */
  secretHash: text('secret_hash').notNull(),
  keyId: text('key_id').notNull().unique(),               // "ak_<base32>" — public identifier
  label: text('label').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),    // ["chat:read", ...]
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  index('agent_api_keys_owner_idx').on(table.ownerUserId),
]);

/* ──────────────────────────────────────────────
   OAuth 2.0 authorization server (Phase D)
   First-party client registry for the authorization-code + PKCE flow.
   ────────────────────────────────────────────── */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientSecretHash: text('client_secret_hash').notNull(),
  name: text('name').notNull(),
  homepageUrl: text('homepage_url'),
  logoUrl: text('logo_url'),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  allowedScopes: jsonb('allowed_scopes').$type<string[]>().notNull(),
  requirePkce: boolean('require_pkce').notNull().default(true),
  requireConsent: boolean('require_consent').notNull().default(true),
  /* Null for dynamically registered clients (RFC 7591) — they have no
   * account-holder owner until an operator adopts them. */
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  codeChallenge: text('code_challenge'),
  codeChallengeMethod: text('code_challenge_method').default('S256'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('oauth_authorization_codes_user_idx').on(table.userId),
]);

export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  clientId: text('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  refreshTokenHash: text('refresh_token_hash'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('oauth_access_tokens_user_idx').on(table.userId),
  index('oauth_access_tokens_refresh_idx').on(table.refreshTokenHash),
]);
