-- P_provider-capability-override — per-provider statement of how the
-- endpoint encodes "no thinking" (Instant). NULL means "use the capability
-- registry's answer".
--
-- Idempotent by construction: the repo requires every migration to be safe
-- to re-run, and this one may run against a database where an operator
-- already added the column by hand.
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "instant_encoding" text;
