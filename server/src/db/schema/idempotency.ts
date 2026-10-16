import { pgTable, text, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/** Committed DB-only writes; never stores raw credentials or idempotency keys. */
export const idempotencyReceipts = pgTable('idempotency_receipts', {
  keyHash: text('key_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  fingerprint: text('fingerprint').notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: text('response_body'), // null = completed, response too large to retain
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idempotency_receipts_expires_at_idx').on(table.expiresAt),
  index('idempotency_receipts_user_id_idx').on(table.userId),
]);
