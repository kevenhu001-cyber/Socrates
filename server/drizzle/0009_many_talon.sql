-- P_message-dedup — unique index on (session_id, client_id) so concurrent
-- POST /api/sessions cannot insert duplicate rows for the same logical
-- message. IF NOT EXISTS guards against re-run after a manual fix.
CREATE UNIQUE INDEX IF NOT EXISTS "messages_session_client_id_idx" ON "messages" USING btree ("session_id","client_id");--> statement-breakpoint
-- Cleanup: the previous schema drift that dropped sessions_exam_data_gin_idx
-- from the schema file is intentional — we skip the DROP here since the
-- index already exists on production and is not causing harm. If a future
-- schema reset needs it, handle it separately.
SELECT 1;