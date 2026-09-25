-- usage_events.usage_source — tell measured token counts apart from guesses.
--
-- Before this, every row in usage_events came from the chars/4 estimate in
-- services/usageTracker.ts: the provider's own `usage` object was never
-- requested (no stream_options.include_usage) and, for streams, would have
-- been dropped anyway because the SSE parse loop skipped any frame without a
-- `choices[0].delta`. The "billing" surface was therefore an activity
-- heatmap with a cost label.
--
-- Now the provider's numbers are used when available and the estimate is the
-- documented fallback, so each row has to say which one it is. An aggregate
-- that mixes measured and estimated totals is wrong in an unknowable
-- direction; with this column it can report them separately.
--
-- Default 'estimate' is deliberate: it labels all pre-existing history
-- truthfully instead of back-dating provider accuracy onto rows that never
-- had it.
--
-- Idempotent: safe to re-run.
--
-- Column only, no new index: the existing usage_events_user_created_idx
-- already serves the user+time aggregates, and no measured query needs a
-- usage_source predicate yet. Adding one speculatively would also have put
-- this migration out of sync with src/db/schema.ts, which is the exact drift
-- that produced the non-idempotent 0036 candidate.

ALTER TABLE "usage_events"
  ADD COLUMN IF NOT EXISTS "usage_source" text NOT NULL DEFAULT 'estimate';
