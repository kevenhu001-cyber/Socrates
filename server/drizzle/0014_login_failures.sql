CREATE TABLE IF NOT EXISTS "login_failures" (
	"email" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_failures_locked_until_idx" ON "login_failures" USING btree ("locked_until");
