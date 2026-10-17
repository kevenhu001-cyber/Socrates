import {
  pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/* ──────────────────────────────────────────────
   Notifications
   ────────────────────────────────────────────── */
export const notificationTokens = pgTable('notification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),  // web | android | ios
  token: text('token').notNull(),
  deviceId: text('device_id'),
  channels: jsonb('channels').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('notification_tokens_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   Status monitor events — self-hosted uptime tracking.
   One row per component state transition, recorded by the
   background monitor (src/services/util/statusMonitor.js). History is
   derived from these rows: a component is "down"/"degraded" for the
   interval between a transition INTO that state and the next
   transition OUT. Uptime over a window = 1 − (down+degraded time)/window.
   ────────────────────────────────────────────── */
export const statusMonitorEvents = pgTable('status_monitor_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  component: text('component').notNull(),    // e.g. "Database", "API Gateway"
  fromState: text('from_state'),             // previous state (null on first record)
  toState: text('to_state').notNull(),       // ok | warn | down
  detail: jsonb('detail').default({}),       // probe metadata / error message
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('status_monitor_events_component_idx').on(table.component),
  index('status_monitor_events_created_at_idx').on(table.createdAt),
  index('status_monitor_events_component_created_at_idx').on(table.component, table.createdAt),
]);

/* ──────────────────────────────────────────────
   Status Subscribers — email addresses subscribed to
   status.topodrive.top notifications. One row per email.
   confirmedAt is set when the subscriber clicks the
   confirmation link in the verification email.
   ────────────────────────────────────────────── */
export const statusSubscribers = pgTable('status_subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  token: text('token').notNull().unique(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('status_subscribers_email_idx').on(table.email),
  index('status_subscribers_token_idx').on(table.token),
]);

/* OAuth connector credentials. Ciphertext fields are never returned by APIs. */
export const connectorConnections = pgTable('connector_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalAccountId: text('external_account_id'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  accessTokenCiphertext: text('access_token_ciphertext').notNull(),
  refreshTokenCiphertext: text('refresh_token_ciphertext'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scopes: text('scopes'),
  installationIds: jsonb('installation_ids').notNull().default([]),
  status: text('status').notNull().default('connected'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('connector_connections_user_provider_idx').on(table.userId, table.provider),
  index('connector_connections_user_id_idx').on(table.userId),
  index('connector_connections_provider_idx').on(table.provider),
]);

/* Metadata for OOMOL ProjectConnector accounts. OAuth tokens deliberately do
 * not appear here: they are held, refreshed, and isolated by OOMOL's gateway.
 * This table lets Socrates render a user's connection state and resume a
 * pending OAuth request after a browser navigation or server restart. */
export const projectConnectorConnections = pgTable('project_connector_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  connectionName: text('connection_name').notNull().default('socrates'),
  requestId: text('request_id'),
  connectedAccountId: text('connected_account_id'),
  displayName: text('display_name'),
  status: text('status').notNull().default('disconnected'),
  scopes: jsonb('scopes').notNull().default([]),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_connector_connections_user_provider_idx').on(table.userId, table.provider),
  index('project_connector_connections_user_id_idx').on(table.userId),
  index('project_connector_connections_request_id_idx').on(table.requestId),
]);
