CREATE INDEX IF NOT EXISTS "sessions_active_user_updated_idx"
  ON "sessions" USING btree ("user_id", "updated_at" DESC)
  WHERE "archived_at" IS NULL;
