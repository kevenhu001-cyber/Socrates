-- mistakes table
CREATE TABLE IF NOT EXISTS "mistakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "session_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL,
  "node_name" text,
  "question_content" text NOT NULL,
  "user_answer" text,
  "correct_answer" text,
  "source" text NOT NULL DEFAULT 'quiz',
  "is_resolved" boolean NOT NULL DEFAULT false,
  "resolved_at" timestamptz,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
-- GIN index on sessions.kb_nodes for JSONB queries (Task 6.2)
CREATE INDEX IF NOT EXISTS "sessions_kb_nodes_gin_idx" ON "sessions" USING GIN ("kb_nodes");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_mistakes_gin_idx" ON "sessions" USING GIN ("mistakes");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mistakes_user_id_idx" ON "mistakes" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mistakes_user_resolved_idx" ON "mistakes" ("user_id", "is_resolved");
