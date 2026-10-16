ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "turn_runtime" jsonb;
--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN IF NOT EXISTS "turn_runtime" jsonb;
