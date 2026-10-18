import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { sessions } from './chat.js';
import { projects, artifacts } from './content.js';

export interface ResearchSource { url: string; title: string; content: string }
export interface ResearchSteps {
  focus?: string;
  plan?: string[];
  searches?: ResearchSource[][];
  sources?: ResearchSource[];
  report?: string;
}

// Separate from workspace runs: research has read-only external effects and
// can safely resume checkpoints after a lease expires. Pi recovery cannot.
export const researchJobs = pgTable('research_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  query: text('query').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('queued'),
  steps: jsonb('steps').$type<ResearchSteps>().notNull().default({}),
  eventSequence: integer('event_sequence').notNull().default(0),
  leaseToken: uuid('lease_token'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  resultArtifactId: uuid('result_artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('research_jobs_user_key_idx').on(t.userId, t.idempotencyKey),
  index('research_jobs_status_lease_idx').on(t.status, t.leaseExpiresAt),
  index('research_jobs_user_session_idx').on(t.userId, t.sessionId),
]);

export const researchJobEvents = pgTable('research_job_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => researchJobs.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  stage: text('stage').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('research_job_events_sequence_idx').on(t.jobId, t.sequence)]);
