ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "assistant_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_assistant_id_artifacts_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_assistant_id_idx" ON "sessions" USING btree ("assistant_id");
