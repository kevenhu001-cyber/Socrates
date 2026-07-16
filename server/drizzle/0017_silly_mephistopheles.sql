CREATE TABLE "login_failures" (
	"email" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "mode" SET DEFAULT 'chat';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "streaming_text" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "streaming_reasoning" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "login_failures_locked_until_idx" ON "login_failures" USING btree ("locked_until");